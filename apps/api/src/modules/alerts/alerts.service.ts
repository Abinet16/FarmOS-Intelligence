import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from '@farmos/shared-types';
import type { Prisma } from '../../generated/prisma/client.js';
import { organizationToday } from '../../database/organization-today.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { loadFlockWindows } from '../analytics/flock-windows.js';
import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { computeStock } from '../inventory/stock.js';
import { dateKey } from '../metrics/flock-metrics.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { alertDigests } from './alert-notifications.js';
import {
  BASELINE_DAYS,
  dedupeKey,
  flockAlerts,
  lowStockAlerts,
  overdueVaccinationAlerts,
  subjectPrefix,
  type AlertCandidate,
} from './alert-rules.js';
import {
  alertSettingsSchema,
  type AlertSettingsDto,
  type EvaluateAlertsDto,
  type ListAlertsQuery,
} from './alerts.schemas.js';

const DAY_MS = 86_400_000;
const person = { select: { id: true, name: true } } as const;
const alertInclude = {
  batch: { select: { id: true, batchCode: true } },
  acknowledger: person,
  resolver: person,
} as const satisfies Prisma.AlertInclude;

/**
 * Evaluates the alert rules over recorded data and tracks each alert from
 * open to resolved. Evaluation is idempotent: every alert has a deterministic
 * dedupe key, so re-running it (by hand, or hourly by the worker) never
 * duplicates anything. New alerts notify the people who act on them.
 */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  getSettings(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, (tx) => this.settings(tx, tenant));
  }

  updateSettings(tenant: TenantContext, dto: AlertSettingsDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await this.settings(tx, tenant);
      await tx.organization.update({
        where: { id: tenant.organizationId },
        data: { alertSettings: dto },
      });
      await this.audit.record(tx, tenant, {
        action: 'alert_settings.updated',
        entityType: 'organization',
        entityId: tenant.organizationId,
        metadata: { before: { ...before }, after: { ...dto } },
      });
      return dto;
    });
  }

  /**
   * Evaluates the organization's last complete day (or dto.date). The actor is
   * the member who asked, or null when the scheduled job runs it.
   */
  async evaluate(actor: AuditActor, dto: EvaluateAlertsDto) {
    const { userId, organizationId } = actor;
    const run = <T>(fn: (tx: Tx) => Promise<T>) =>
      userId
        ? this.prisma.withTenant({ organizationId, userId }, fn)
        : this.prisma.withOrganization(organizationId, fn);

    const { result, emails } = await run(async (tx) => {
      const tenant = { organizationId };
      const today = await organizationToday(tx, organizationId);
      const day = dto.date ?? new Date(today.getTime() - DAY_MS);
      if (day > today) throw invalidField('date', 'cannot be in the future');
      const date = dateKey(day);
      const settings = await this.settings(tx, tenant);

      const windows = await loadFlockWindows(
        tx,
        organizationId,
        { from: new Date(day.getTime() - BASELINE_DAYS * DAY_MS), to: day },
        { activeOnly: true },
      );
      const vaccinations = await tx.vaccinationRecord.findMany({
        where: {
          organizationId,
          status: 'SCHEDULED',
          scheduledDate: { lt: day },
          batch: { status: { in: ['PLANNED', 'ACTIVE'] } },
        },
        select: {
          id: true,
          scheduledDate: true,
          batchId: true,
          batch: { select: { batchCode: true } },
          vaccine: { select: { name: true } },
        },
      });
      const stock = await computeStock(tx, organizationId, { belowReorder: true });

      const candidates: AlertCandidate[] = [
        ...windows.flatMap(({ flock, rows }) => flockAlerts(flock, rows, date, settings)),
        ...overdueVaccinationAlerts(
          vaccinations.map((v) => ({
            id: v.id,
            batchId: v.batchId,
            batchCode: v.batch.batchCode,
            vaccineName: v.vaccine.name,
            scheduledDate: dateKey(v.scheduledDate),
          })),
          date,
          settings,
        ),
        ...lowStockAlerts(
          stock.map((row) => ({
            itemId: row.item.id,
            itemName: row.item.name,
            unit: row.item.unit,
            farmId: row.farm.id,
            farmName: row.farm.name,
            balance: row.balance,
            reorderLevel: row.reorderLevel,
            belowReorder: row.belowReorder,
          })),
          date,
          settings,
        ),
      ];

      const fresh = await this.withoutOpenDuplicates(tx, tenant, candidates);
      const created = await tx.alert.createManyAndReturn({
        data: fresh.map((candidate) => ({
          organizationId,
          batchId: candidate.batchId,
          ruleCode: candidate.ruleCode,
          severity: candidate.severity,
          dedupeKey: dedupeKey(candidate),
          details: candidate.details,
        })),
        skipDuplicates: true,
        select: { id: true, ruleCode: true, severity: true },
      });
      const count = created.length;

      await this.audit.record(tx, actor, {
        action: 'alerts.evaluated',
        entityType: 'organization',
        entityId: organizationId,
        metadata: {
          date,
          flocks: windows.length,
          candidates: candidates.length,
          created: count,
          scheduled: userId === null,
        },
      });

      const members = await tx.membership.findMany({
        where: { organizationId },
        select: { userId: true, role: true },
      });
      const emails = await this.notifications.create(
        tx,
        organizationId,
        alertDigests(created, members, date),
      );
      return {
        result: { date, flocksChecked: windows.length, raised: candidates.length, created: count },
        emails,
      };
    });
    await this.notifications.sendEmails(organizationId, emails);
    return result;
  }

  list(tenant: TenantContext, query: ListAlertsQuery) {
    const where: Prisma.AlertWhereInput = {
      organizationId: tenant.organizationId,
      ...(query.status && { status: query.status }),
      ...(query.open && { status: { not: 'RESOLVED' } }),
      ...(query.severity && { severity: query.severity }),
      ...(query.batchId && { batchId: query.batchId }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.alert.findMany({
          where,
          include: alertInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...pageArgs(query),
        }),
        tx.alert.count({ where }),
      ]);
      return toPage(items, total, query);
    });
  }

  acknowledge(tenant: TenantContext, alertId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const alert = await this.lockOrThrow(tx, tenant, alertId);
      if (alert.status !== 'OPEN') {
        throw new ConflictException(`This alert is already ${alert.status.toLowerCase()}`);
      }
      const updated = await tx.alert.update({
        where: { id: alertId },
        data: { status: 'ACKNOWLEDGED', acknowledgedBy: tenant.userId, acknowledgedAt: new Date() },
        include: alertInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'alert.acknowledged',
        entityType: 'alert',
        entityId: alertId,
        metadata: { ruleCode: alert.ruleCode },
      });
      return updated;
    });
  }

  resolve(tenant: TenantContext, alertId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const alert = await this.lockOrThrow(tx, tenant, alertId);
      if (alert.status === 'RESOLVED')
        throw new ConflictException('This alert is already resolved');
      const updated = await tx.alert.update({
        where: { id: alertId },
        data: { status: 'RESOLVED', resolvedBy: tenant.userId, resolvedAt: new Date() },
        include: alertInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'alert.resolved',
        entityType: 'alert',
        entityId: alertId,
        metadata: { ruleCode: alert.ruleCode },
      });
      return updated;
    });
  }

  /** Stored settings merged over the defaults, so new fields get sane values. */
  private async settings(
    tx: Tx,
    tenant: Pick<TenantContext, 'organizationId'>,
  ): Promise<AlertSettings> {
    const { alertSettings } = await tx.organization.findUniqueOrThrow({
      where: { id: tenant.organizationId },
      select: { alertSettings: true },
    });
    const parsed = alertSettingsSchema.partial().safeParse(alertSettings ?? {});
    return { ...DEFAULT_ALERT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
  }

  /** A persistent condition keeps one unresolved alert, however many days it lasts. */
  private async withoutOpenDuplicates(
    tx: Tx,
    tenant: Pick<TenantContext, 'organizationId'>,
    candidates: AlertCandidate[],
  ): Promise<AlertCandidate[]> {
    const persistent = candidates.filter((c) => c.persistent);
    if (persistent.length === 0) return candidates;
    const open = await tx.alert.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: { not: 'RESOLVED' },
        OR: persistent.map((c) => ({ dedupeKey: { startsWith: subjectPrefix(c) } })),
      },
      select: { dedupeKey: true },
    });
    return candidates.filter(
      (c) => !c.persistent || !open.some((alert) => alert.dedupeKey.startsWith(subjectPrefix(c))),
    );
  }

  private async lockOrThrow(tx: Tx, tenant: TenantContext, alertId: string) {
    const [alert] = await tx.$queryRaw<{ status: string; rule_code: string }[]>`
      SELECT status, rule_code FROM alerts
      WHERE id = ${alertId}::uuid AND organization_id = ${tenant.organizationId}::uuid
      FOR UPDATE`;
    if (!alert) throw new NotFoundException('Alert not found');
    return { status: alert.status, ruleCode: alert.rule_code };
  }
}
