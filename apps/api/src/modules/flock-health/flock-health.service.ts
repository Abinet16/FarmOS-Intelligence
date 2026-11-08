import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { organizationToday } from '../../database/organization-today.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { lockBatch } from '../flock-records/record-rules.js';
import { dateKey } from '../metrics/flock-metrics.js';
import type {
  HealthEventDto,
  ListHealthEventsQuery,
  ListVaccinationsQuery,
  ScheduleVaccinationDto,
  UpdateHealthEventDto,
  VaccinationOutcomeDto,
} from './flock-health.schemas.js';

const DAY_MS = 86_400_000;
const person = { select: { id: true, name: true } } as const;
const batchSummary = { select: { id: true, batchCode: true, status: true } } as const;

const vaccinationInclude = {
  vaccine: { select: { id: true, name: true, recommendedIntervalDays: true } },
  batch: batchSummary,
  recorder: person,
} as const satisfies Prisma.VaccinationRecordInclude;

const healthEventInclude = {
  batch: batchSummary,
  recorder: person,
} as const satisfies Prisma.HealthEventInclude;

/**
 * Vaccination schedules and health observations for flock batches. These are
 * records of what was planned, given and seen; FarmOS does not diagnose.
 */
@Injectable()
export class FlockHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listVaccinations(tenant: TenantContext, query: ListVaccinationsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const today = await organizationToday(tx, tenant.organizationId);
      const where: Prisma.VaccinationRecordWhereInput = {
        organizationId: tenant.organizationId,
        ...(query.batchId && { batchId: query.batchId }),
        ...(query.status && { status: query.status }),
        ...(query.dueWithinDays !== undefined && {
          status: 'SCHEDULED',
          scheduledDate: { lte: new Date(today.getTime() + query.dueWithinDays * DAY_MS) },
          batch: { status: { in: ['PLANNED', 'ACTIVE'] } },
        }),
      };
      const [items, total] = await Promise.all([
        tx.vaccinationRecord.findMany({
          where,
          include: vaccinationInclude,
          orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
          ...pageArgs(query),
        }),
        tx.vaccinationRecord.count({ where }),
      ]);
      return toPage(
        items.map((v) => ({ ...v, overdue: v.status === 'SCHEDULED' && v.scheduledDate < today })),
        total,
        query,
      );
    });
  }

  schedule(tenant: TenantContext, batchId: string, dto: ScheduleVaccinationDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status !== 'PLANNED' && batch.status !== 'ACTIVE') {
        throw new ConflictException(
          'Vaccinations can only be scheduled for planned or active flocks',
        );
      }
      if (dto.scheduledDate < batch.placementDate) {
        throw invalidField('scheduledDate', 'is before the placement date');
      }
      await this.assertVaccine(tx, tenant, dto.vaccineId);

      const vaccination = await tx.vaccinationRecord.create({
        data: { organizationId: tenant.organizationId, batchId, ...dto },
        include: vaccinationInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'vaccination.scheduled',
        entityType: 'vaccination_record',
        entityId: vaccination.id,
        metadata: { batchId, vaccineId: dto.vaccineId, scheduledDate: dateKey(dto.scheduledDate) },
      });
      return vaccination;
    });
  }

  /**
   * Records what happened to a scheduled vaccination. Administering one can
   * also schedule its booster from the vaccine's recommended interval.
   */
  recordOutcome(
    tenant: TenantContext,
    batchId: string,
    vaccinationId: string,
    dto: VaccinationOutcomeDto,
  ) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      const current = await tx.vaccinationRecord.findFirst({
        where: { id: vaccinationId, batchId, organizationId: tenant.organizationId },
        include: { vaccine: true },
      });
      if (!current) throw new NotFoundException('Vaccination not found');
      if (current.status !== 'SCHEDULED') {
        throw new ConflictException(`This vaccination is already ${current.status.toLowerCase()}`);
      }

      let next = null;
      if (dto.status === 'ADMINISTERED') {
        if (batch.status !== 'ACTIVE') {
          throw new ConflictException('Vaccines can only be given to an active flock');
        }
        const administeredAt = dto.administeredAt ?? new Date();
        if (administeredAt > new Date()) {
          throw invalidField('administeredAt', 'cannot be in the future');
        }
        if (administeredAt < batch.placementDate) {
          throw invalidField('administeredAt', 'is before the placement date');
        }

        await tx.vaccinationRecord.update({
          where: { id: vaccinationId },
          data: { status: 'ADMINISTERED', administeredAt, recordedBy: tenant.userId },
        });
        const interval = current.vaccine.recommendedIntervalDays;
        if (dto.scheduleNext && interval) {
          const given = new Date(`${dateKey(administeredAt)}T00:00:00Z`);
          next = await tx.vaccinationRecord.create({
            data: {
              organizationId: tenant.organizationId,
              batchId,
              vaccineId: current.vaccineId,
              scheduledDate: new Date(given.getTime() + interval * DAY_MS),
            },
            include: vaccinationInclude,
          });
        }
      } else {
        await tx.vaccinationRecord.update({
          where: { id: vaccinationId },
          data: { status: dto.status, recordedBy: tenant.userId },
        });
      }

      await this.audit.record(tx, tenant, {
        action: `vaccination.${dto.status.toLowerCase()}`,
        entityType: 'vaccination_record',
        entityId: vaccinationId,
        metadata: { batchId, vaccineId: current.vaccineId, nextVaccinationId: next?.id ?? null },
      });
      const vaccination = await tx.vaccinationRecord.findUniqueOrThrow({
        where: { id: vaccinationId },
        include: vaccinationInclude,
      });
      return { vaccination, next };
    });
  }

  listHealthEvents(tenant: TenantContext, query: ListHealthEventsQuery) {
    const where: Prisma.HealthEventWhereInput = {
      organizationId: tenant.organizationId,
      ...(query.batchId && { batchId: query.batchId }),
      ...(query.resolutionStatus && { resolutionStatus: query.resolutionStatus }),
      ...(query.severity && { severity: query.severity }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.healthEvent.findMany({
          where,
          include: healthEventInclude,
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          ...pageArgs(query),
        }),
        tx.healthEvent.count({ where }),
      ]);
      return toPage(items, total, query);
    });
  }

  recordHealthEvent(tenant: TenantContext, batchId: string, dto: HealthEventDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status !== 'ACTIVE' && batch.status !== 'DEPLETED') {
        throw new ConflictException('Health events can only be recorded for placed flocks');
      }
      const observedAt = dto.observedAt ?? new Date();
      if (observedAt > new Date()) throw invalidField('observedAt', 'cannot be in the future');
      if (observedAt < batch.placementDate) {
        throw invalidField('observedAt', 'is before the placement date');
      }

      const event = await tx.healthEvent.create({
        data: {
          organizationId: tenant.organizationId,
          batchId,
          observedAt,
          category: dto.category,
          severity: dto.severity,
          description: dto.description,
          recordedBy: tenant.userId,
        },
        include: healthEventInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'health_event.recorded',
        entityType: 'health_event',
        entityId: event.id,
        metadata: { batchId, category: dto.category, severity: dto.severity },
      });
      return event;
    });
  }

  updateHealthEvent(
    tenant: TenantContext,
    batchId: string,
    eventId: string,
    dto: UpdateHealthEventDto,
  ) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');
      const before = await tx.healthEvent.findFirst({
        where: { id: eventId, batchId, organizationId: tenant.organizationId },
      });
      if (!before) throw new NotFoundException('Health event not found');

      const event = await tx.healthEvent.update({
        where: { id: eventId },
        data: { resolutionStatus: dto.resolutionStatus },
        include: healthEventInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'health_event.status_changed',
        entityType: 'health_event',
        entityId: eventId,
        metadata: { from: before.resolutionStatus, to: dto.resolutionStatus },
      });
      return event;
    });
  }

  private async assertVaccine(tx: Tx, tenant: TenantContext, vaccineId: string) {
    const vaccine = await tx.vaccine.findFirst({
      where: { id: vaccineId, organizationId: tenant.organizationId },
      select: { id: true },
    });
    if (!vaccine) throw invalidField('vaccineId', 'unknown vaccine');
  }
}
