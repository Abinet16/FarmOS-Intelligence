import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { organizationToday } from '../../database/organization-today.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { dailyMetrics, dateKey, laysEggs } from '../metrics/flock-metrics.js';
import {
  assertEggCount,
  lockBatch,
  numberOrNull,
  sumDeaths,
  toFeedUsage,
  toProductionLog,
  toWeightSample,
  type LockedBatch,
  type Decimalish,
} from './record-rules.js';
import type {
  DailyEntryDto,
  DateRangeQuery,
  UpdateProductionLogDto,
  VoidableKind,
  VoidRecordDto,
} from './flock-records.schemas.js';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 366;

const recorder = { select: { id: true, name: true } } as const;

const VOID_ENTITY: Record<VoidableKind, string> = {
  mortality: 'mortality_event',
  'feed-usage': 'feed_usage',
  'weight-samples': 'weight_sample',
};

/**
 * Daily operational records for a flock batch: production logs, mortality,
 * feed and weight samples, and the daily metrics derived from them.
 */
@Injectable()
export class FlockRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Saves one day's entry for a batch in a single transaction. */
  recordDay(tenant: TenantContext, batchId: string, dto: DailyEntryDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      await this.assertRecordable(tx, tenant, batch, dto.date);

      const { organizationId, userId } = tenant;
      const deathsBefore = await sumDeaths(tx, tenant, batchId, { lt: dto.date });
      const deathsAfter = await sumDeaths(tx, tenant, batchId, { gte: dto.date });
      const opening = batch.initialBirds - deathsBefore;
      const newDeaths = dto.deaths.reduce((sum, death) => sum + death.quantity, 0);
      const liveAtEnd = batch.initialBirds - deathsBefore - deathsAfter;

      if (newDeaths > liveAtEnd) {
        throw invalidField('deaths', `only ${liveAtEnd} birds remain in this batch`);
      }

      const wantsLog =
        dto.eggsCollected !== undefined || dto.waterLitres !== undefined || dto.notes !== undefined;
      if (wantsLog) {
        if (laysEggs(batch.purpose)) {
          if (dto.eggsCollected === undefined) {
            throw invalidField('eggsCollected', 'required for laying flocks');
          }
          if (dto.eggsCollected > opening) {
            throw invalidField(
              'eggsCollected',
              `cannot exceed the ${opening} birds alive that day`,
            );
          }
        } else if (dto.eggsCollected) {
          throw invalidField('eggsCollected', 'broiler flocks do not lay eggs');
        }
        const existing = await tx.productionLog.findFirst({
          where: { organizationId, batchId, logDate: dto.date },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException('This day already has a production log; edit it instead');
        }
      }

      if (dto.feed.length > 0) {
        const ids = [...new Set(dto.feed.map((item) => item.feedTypeId))];
        const known = await tx.feedType.count({ where: { organizationId, id: { in: ids } } });
        if (known !== ids.length) throw invalidField('feed', 'unknown feed type');
      }
      if (dto.weight && dto.weight.sampleSize > opening - newDeaths) {
        throw invalidField('weight.sampleSize', 'cannot exceed the birds alive that day');
      }

      const productionLog = wantsLog
        ? await tx.productionLog.create({
            data: {
              organizationId,
              batchId,
              logDate: dto.date,
              eggsCollected: dto.eggsCollected ?? 0,
              waterConsumption: dto.waterLitres,
              notes: dto.notes,
              createdBy: userId,
            },
          })
        : null;
      const mortality = await Promise.all(
        dto.deaths.map((death) =>
          tx.mortalityEvent.create({
            data: { organizationId, batchId, eventDate: dto.date, recordedBy: userId, ...death },
          }),
        ),
      );
      const feed = await Promise.all(
        dto.feed.map((item) =>
          tx.feedUsage.create({
            data: { organizationId, batchId, usageDate: dto.date, recordedBy: userId, ...item },
          }),
        ),
      );
      const weight = dto.weight
        ? await tx.weightSample.create({
            data: {
              organizationId,
              batchId,
              sampleDate: dto.date,
              recordedBy: userId,
              ...dto.weight,
            },
          })
        : null;

      await this.audit.record(tx, tenant, {
        action: 'daily_entry.recorded',
        entityType: 'flock_batch',
        entityId: batchId,
        metadata: {
          date: dateKey(dto.date),
          productionLogId: productionLog?.id ?? null,
          deaths: newDeaths,
          feedKg: dto.feed.reduce((sum, item) => sum + item.quantityKg, 0),
          weightSample: Boolean(weight),
        },
      });

      return {
        productionLog: productionLog && toProductionLog(productionLog),
        mortality,
        feed: feed.map(toFeedUsage),
        weight: weight && toWeightSample(weight),
      };
    });
  }

  /** Raw records in a date range, newest first, with who recorded them. */
  listRecords(tenant: TenantContext, batchId: string, range: DateRangeQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      await this.findBatch(tx, tenant, batchId);
      const where = { organizationId: tenant.organizationId, batchId };
      const window = { gte: range.from, lte: range.to };
      const take = 500;

      const [productionLogs, mortality, feed, weights] = await Promise.all([
        tx.productionLog.findMany({
          where: { ...where, logDate: window },
          orderBy: { logDate: 'desc' },
          include: { creator: recorder, approver: recorder },
          take,
        }),
        tx.mortalityEvent.findMany({
          where: { ...where, eventDate: window },
          orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
          include: { recorder, voider: recorder },
          take,
        }),
        tx.feedUsage.findMany({
          where: { ...where, usageDate: window },
          orderBy: [{ usageDate: 'desc' }, { createdAt: 'desc' }],
          include: { recorder, voider: recorder, feedType: { select: { id: true, name: true } } },
          take,
        }),
        tx.weightSample.findMany({
          where: { ...where, sampleDate: window },
          orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
          include: { recorder, voider: recorder },
          take,
        }),
      ]);
      return {
        productionLogs: productionLogs.map(toProductionLog),
        mortality,
        feed: feed.map(toFeedUsage),
        weightSamples: weights.map(toWeightSample),
      };
    });
  }

  /**
   * One metrics row per day. Defaults to the last two weeks of the batch's
   * life; at most a year per request.
   */
  dailyMetrics(tenant: TenantContext, batchId: string, range: DateRangeQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await this.findBatch(tx, tenant, batchId);
      const today = await organizationToday(tx, tenant.organizationId);
      const end = batch.endDate && batch.endDate < today ? batch.endDate : today;
      const to = range.to ?? end;
      const from = range.from ?? new Date(to.getTime() - (DEFAULT_WINDOW_DAYS - 1) * DAY_MS);
      if ((to.getTime() - from.getTime()) / DAY_MS >= MAX_WINDOW_DAYS) {
        throw invalidField('from', `the range can span at most ${MAX_WINDOW_DAYS} days`);
      }
      if (batch.status === 'PLANNED') return { from: dateKey(from), to: dateKey(to), days: [] };

      const where = { organizationId: tenant.organizationId, batchId };
      const live = { ...where, voidedAt: null };
      const window = { gte: from, lte: to };
      const [deaths, logs, feed, weights] = await Promise.all([
        // All deaths up to the window's end: earlier ones set the opening population.
        tx.mortalityEvent.groupBy({
          by: ['eventDate'],
          where: { ...live, eventDate: { lte: to } },
          _sum: { quantity: true },
        }),
        tx.productionLog.findMany({
          where: { ...where, logDate: window },
          select: { logDate: true, eggsCollected: true, waterConsumption: true },
        }),
        tx.feedUsage.groupBy({
          by: ['usageDate'],
          where: { ...live, usageDate: window },
          _sum: { quantityKg: true },
        }),
        tx.weightSample.findMany({
          where: { ...live, sampleDate: window },
          select: { sampleDate: true, sampleSize: true, averageWeightGrams: true },
        }),
      ]);

      const days = dailyMetrics(
        batch,
        {
          deaths: new Map(deaths.map((d) => [dateKey(d.eventDate), d._sum.quantity ?? 0])),
          eggs: laysEggs(batch.purpose)
            ? new Map(logs.map((log) => [dateKey(log.logDate), log.eggsCollected]))
            : new Map(),
          feedKg: new Map(feed.map((f) => [dateKey(f.usageDate), Number(f._sum.quantityKg ?? 0)])),
          waterLitres: new Map(
            logs
              .filter((log) => log.waterConsumption !== null)
              .map((log) => [dateKey(log.logDate), Number(log.waterConsumption)]),
          ),
          averageWeightGrams: weightedAverages(weights),
        },
        from,
        to,
      );
      return { from: dateKey(from), to: dateKey(to), days: days.reverse() };
    });
  }

  /** Submitted logs stay editable; approved ones change only through corrections. */
  updateProductionLog(
    tenant: TenantContext,
    batchId: string,
    logId: string,
    dto: UpdateProductionLogDto,
  ) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');
      const log = await this.findLog(tx, tenant, batchId, logId);
      if (log.status === 'APPROVED') {
        throw new ConflictException('This log is approved; request a correction instead');
      }

      if (dto.eggsCollected !== undefined) {
        await assertEggCount(tx, tenant, batchId, batch, log.logDate, dto.eggsCollected);
      }

      const { waterLitres, ...rest } = dto;
      const updated = await tx.productionLog.update({
        where: { id: logId },
        data: { ...rest, ...(waterLitres !== undefined && { waterConsumption: waterLitres }) },
      });
      await this.audit.record(tx, tenant, {
        action: 'production_log.updated',
        entityType: 'production_log',
        entityId: logId,
        metadata: {
          before: {
            eggsCollected: log.eggsCollected,
            waterLitres: numberOrNull(log.waterConsumption),
          },
          after: {
            eggsCollected: updated.eggsCollected,
            waterLitres: numberOrNull(updated.waterConsumption),
          },
        },
      });
      return toProductionLog(updated);
    });
  }

  approveProductionLog(tenant: TenantContext, batchId: string, logId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      await lockBatch(tx, tenant, batchId);
      const log = await this.findLog(tx, tenant, batchId, logId);
      if (log.status === 'APPROVED') throw new ConflictException('This log is already approved');

      const updated = await tx.productionLog.update({
        where: { id: logId },
        data: { status: 'APPROVED', approvedBy: tenant.userId, approvedAt: new Date() },
      });
      await this.audit.record(tx, tenant, {
        action: 'production_log.approved',
        entityType: 'production_log',
        entityId: logId,
        metadata: { date: dateKey(log.logDate), createdBy: log.createdBy },
      });
      return toProductionLog(updated);
    });
  }

  /**
   * Mortality, feed and weight records are never edited. A wrong one is voided
   * with a reason, which keeps the original visible but drops it from every
   * total, and the right value is entered again as a new record.
   */
  voidRecord(
    tenant: TenantContext,
    batchId: string,
    kind: VoidableKind,
    recordId: string,
    dto: VoidRecordDto,
  ) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await lockBatch(tx, tenant, batchId);
      if (batch.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');

      const where = { id: recordId, batchId, organizationId: tenant.organizationId };
      const found =
        kind === 'mortality'
          ? await tx.mortalityEvent.findFirst({ where, select: { voidedAt: true } })
          : kind === 'feed-usage'
            ? await tx.feedUsage.findFirst({ where, select: { voidedAt: true } })
            : await tx.weightSample.findFirst({ where, select: { voidedAt: true } });
      if (!found) throw new NotFoundException('Record not found');
      if (found.voidedAt) throw new ConflictException('This record is already voided');

      const data = { voidedAt: new Date(), voidedBy: tenant.userId, voidReason: dto.reason };
      const updated =
        kind === 'mortality'
          ? await tx.mortalityEvent.update({ where: { id: recordId }, data })
          : kind === 'feed-usage'
            ? toFeedUsage(await tx.feedUsage.update({ where: { id: recordId }, data }))
            : toWeightSample(await tx.weightSample.update({ where: { id: recordId }, data }));

      await this.audit.record(tx, tenant, {
        action: `${VOID_ENTITY[kind]}.voided`,
        entityType: VOID_ENTITY[kind],
        entityId: recordId,
        metadata: { batchId, reason: dto.reason },
      });
      return updated;
    });
  }

  /**
   * Recording is allowed while birds are in the house, and for late entries
   * after depletion, on dates within the batch's life and not in the future.
   */
  private async assertRecordable(tx: Tx, tenant: TenantContext, batch: LockedBatch, date: Date) {
    if (batch.status === 'PLANNED') {
      throw new ConflictException('Place the birds before recording for this batch');
    }
    if (batch.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');

    const today = await organizationToday(tx, tenant.organizationId);
    if (date > today) throw invalidField('date', 'cannot be in the future');
    if (date < batch.placementDate) throw invalidField('date', 'is before the placement date');
    if (batch.endDate && date > batch.endDate) {
      throw invalidField('date', 'is after the batch was depleted');
    }
  }

  private async findBatch(tx: Tx, tenant: TenantContext, batchId: string) {
    const batch = await tx.flockBatch.findFirst({
      where: { id: batchId, organizationId: tenant.organizationId },
      select: {
        status: true,
        purpose: true,
        initialBirds: true,
        placementDate: true,
        endDate: true,
      },
    });
    if (!batch) throw new NotFoundException('Flock batch not found');
    return batch;
  }

  private async findLog(tx: Tx, tenant: TenantContext, batchId: string, logId: string) {
    const log = await tx.productionLog.findFirst({
      where: { id: logId, batchId, organizationId: tenant.organizationId },
    });
    if (!log) throw new NotFoundException('Production log not found');
    return log;
  }
}

/** Several samples on one day combine weighted by sample size. */
function weightedAverages(
  samples: { sampleDate: Date; sampleSize: number; averageWeightGrams: Decimalish }[],
): Map<string, number> {
  const totals = new Map<string, { grams: number; birds: number }>();
  for (const sample of samples) {
    const key = dateKey(sample.sampleDate);
    const total = totals.get(key) ?? { grams: 0, birds: 0 };
    total.grams += Number(sample.averageWeightGrams) * sample.sampleSize;
    total.birds += sample.sampleSize;
    totals.set(key, total);
  }
  return new Map([...totals].map(([key, { grams, birds }]) => [key, grams / birds]));
}
