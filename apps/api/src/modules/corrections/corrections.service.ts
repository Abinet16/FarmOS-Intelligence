import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { dateKey } from '../metrics/flock-metrics.js';
import {
  assertEggCount,
  lockBatch,
  numberOrNull,
  toProductionLog,
} from '../flock-records/record-rules.js';
import type {
  ListCorrectionsQuery,
  ProposedChanges,
  RequestCorrectionDto,
  ReviewCorrectionDto,
} from './corrections.schemas.js';

const person = { select: { id: true, name: true } } as const;

const correctionInclude = {
  requester: person,
  reviewer: person,
  productionLog: {
    select: {
      id: true,
      logDate: true,
      eggsCollected: true,
      waterConsumption: true,
      notes: true,
      batch: { select: { id: true, batchCode: true } },
    },
  },
} as const satisfies Prisma.ProductionLogCorrectionInclude;

type CorrectionRow = Prisma.ProductionLogCorrectionGetPayload<{
  include: typeof correctionInclude;
}>;

function toCorrection({ productionLog, ...correction }: CorrectionRow) {
  return { ...correction, productionLog: toProductionLog(productionLog) };
}

/**
 * Approved production logs are never edited in place. A change is proposed
 * with a reason, reviewed by a different person, and applied only on
 * approval, with the before and after values in the audit log.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  request(tenant: TenantContext, batchId: string, logId: string, dto: RequestCorrectionDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');

      const log = await tx.productionLog.findFirst({
        where: { id: logId, batchId, organizationId: tenant.organizationId },
      });
      if (!log) throw new NotFoundException('Production log not found');
      if (log.status !== 'APPROVED') {
        throw new ConflictException('This log is not approved yet; edit it directly');
      }

      const changes = this.actualChanges(dto.changes, {
        eggsCollected: log.eggsCollected,
        waterLitres: numberOrNull(log.waterConsumption),
        notes: log.notes,
      });
      if (changes.eggsCollected !== undefined) {
        await assertEggCount(tx, tenant, batchId, batch, log.logDate, changes.eggsCollected);
      }

      const pending = await tx.productionLogCorrection.findFirst({
        where: { organizationId: tenant.organizationId, productionLogId: logId, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) throw new ConflictException('This log already has a pending correction');

      const correction = await tx.productionLogCorrection.create({
        data: {
          organizationId: tenant.organizationId,
          productionLogId: logId,
          proposedChanges: changes,
          reason: dto.reason,
          requestedBy: tenant.userId,
        },
        include: correctionInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'correction.requested',
        entityType: 'production_log_correction',
        entityId: correction.id,
        metadata: { productionLogId: logId, changes, reason: dto.reason },
      });
      return toCorrection(correction);
    });
  }

  list(tenant: TenantContext, query: ListCorrectionsQuery) {
    const where: Prisma.ProductionLogCorrectionWhereInput = {
      organizationId: tenant.organizationId,
      ...(query.status && { status: query.status }),
      ...(query.batchId && { productionLog: { batchId: query.batchId } }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.productionLogCorrection.findMany({
          where,
          include: correctionInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...pageArgs(query),
        }),
        tx.productionLogCorrection.count({ where }),
      ]);
      return toPage(items.map(toCorrection), total, query);
    });
  }

  /** Applies the proposed values, re-checked against the flock as it is now. */
  approve(tenant: TenantContext, correctionId: string, dto: ReviewCorrectionDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const { correction, log, batchId } = await this.loadForReview(tx, tenant, correctionId);
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');

      const changes = correction.proposedChanges as ProposedChanges;
      if (changes.eggsCollected !== undefined) {
        await assertEggCount(tx, tenant, batchId, batch, log.logDate, changes.eggsCollected);
      }

      const { waterLitres, ...rest } = changes;
      const updated = await tx.productionLog.update({
        where: { id: log.id },
        data: { ...rest, ...(waterLitres !== undefined && { waterConsumption: waterLitres }) },
      });
      const reviewed = await this.markReviewed(tx, tenant, correctionId, 'APPROVED', dto.note);

      await this.audit.record(tx, tenant, {
        action: 'production_log.corrected',
        entityType: 'production_log',
        entityId: log.id,
        metadata: {
          correctionId,
          date: dateKey(log.logDate),
          before: {
            eggsCollected: log.eggsCollected,
            waterLitres: numberOrNull(log.waterConsumption),
            notes: log.notes,
          },
          after: {
            eggsCollected: updated.eggsCollected,
            waterLitres: numberOrNull(updated.waterConsumption),
            notes: updated.notes,
          },
        },
      });
      return reviewed;
    });
  }

  reject(tenant: TenantContext, correctionId: string, dto: ReviewCorrectionDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      await this.loadForReview(tx, tenant, correctionId);
      const reviewed = await this.markReviewed(tx, tenant, correctionId, 'REJECTED', dto.note);
      await this.audit.record(tx, tenant, {
        action: 'correction.rejected',
        entityType: 'production_log_correction',
        entityId: correctionId,
        metadata: { note: dto.note ?? null },
      });
      return reviewed;
    });
  }

  /** Locks the correction and enforces that nobody reviews their own request. */
  private async loadForReview(tx: Tx, tenant: TenantContext, correctionId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM production_log_corrections
      WHERE id = ${correctionId}::uuid AND organization_id = ${tenant.organizationId}::uuid
      FOR UPDATE`;
    if (!locked) throw new NotFoundException('Correction not found');

    const correction = await tx.productionLogCorrection.findUniqueOrThrow({
      where: { id: correctionId },
      include: { productionLog: true },
    });
    if (correction.status !== 'PENDING') {
      throw new ConflictException(`This correction was already ${correction.status.toLowerCase()}`);
    }
    if (correction.requestedBy === tenant.userId) {
      throw new ForbiddenException(
        'A correction must be reviewed by someone other than its requester',
      );
    }
    return {
      correction,
      log: correction.productionLog,
      batchId: correction.productionLog.batchId,
    };
  }

  private async markReviewed(
    tx: Tx,
    tenant: TenantContext,
    correctionId: string,
    status: 'APPROVED' | 'REJECTED',
    note: string | undefined,
  ) {
    const reviewed = await tx.productionLogCorrection.update({
      where: { id: correctionId },
      data: { status, reviewedBy: tenant.userId, reviewedAt: new Date(), reviewNote: note },
      include: correctionInclude,
    });
    return toCorrection(reviewed);
  }

  /** Drops proposed values equal to the current ones; a no-op request is a 400. */
  private actualChanges(proposed: ProposedChanges, current: Required<ProposedChanges>) {
    const changes = Object.fromEntries(
      Object.entries(proposed).filter(
        ([key, value]) => value !== current[key as keyof ProposedChanges],
      ),
    ) as ProposedChanges;
    if (Object.keys(changes).length === 0) {
      throw invalidField('changes', 'the proposed values match the current log');
    }
    return changes;
  }
}
