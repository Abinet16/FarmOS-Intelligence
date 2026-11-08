import { NotFoundException } from '@nestjs/common';
import type { BatchStatus, FlockPurpose } from '@farmos/shared-types';
import type { Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { laysEggs, type BatchFacts } from '../metrics/flock-metrics.js';

/** Rules shared by daily entries, log edits and corrections. */

export interface LockedBatch extends BatchFacts {
  status: BatchStatus;
}

/** Locks the batch so concurrent entries can't together exceed its birds. */
export async function lockBatch(
  tx: Tx,
  tenant: TenantContext,
  batchId: string,
): Promise<LockedBatch> {
  const [row] = await tx.$queryRaw<
    {
      status: BatchStatus;
      purpose: FlockPurpose;
      initial_birds: number;
      placement_date: Date;
      end_date: Date | null;
    }[]
  >`
    SELECT status, purpose, initial_birds, placement_date, end_date FROM flock_batches
    WHERE id = ${batchId}::uuid AND organization_id = ${tenant.organizationId}::uuid
    FOR UPDATE`;
  if (!row) throw new NotFoundException('Flock batch not found');
  return {
    status: row.status,
    purpose: row.purpose,
    initialBirds: row.initial_birds,
    placementDate: row.placement_date,
    endDate: row.end_date,
  };
}

/** Deaths that still count: voided records are excluded everywhere. */
export async function sumDeaths(
  tx: Tx,
  tenant: TenantContext,
  batchId: string,
  eventDate: { lt: Date } | { gte: Date },
) {
  const { _sum } = await tx.mortalityEvent.aggregate({
    where: { organizationId: tenant.organizationId, batchId, eventDate, voidedAt: null },
    _sum: { quantity: true },
  });
  return _sum.quantity ?? 0;
}

/**
 * An egg count must come from a laying flock and can't exceed the birds alive
 * at the start of that day.
 */
export async function assertEggCount(
  tx: Tx,
  tenant: TenantContext,
  batchId: string,
  batch: LockedBatch,
  logDate: Date,
  eggs: number,
) {
  if (!laysEggs(batch.purpose) && eggs > 0) {
    throw invalidField('eggsCollected', 'broiler flocks do not lay eggs');
  }
  const opening = batch.initialBirds - (await sumDeaths(tx, tenant, batchId, { lt: logDate }));
  if (eggs > opening) {
    throw invalidField('eggsCollected', `cannot exceed the ${opening} birds alive that day`);
  }
}

export type Decimalish = { toString(): string } | null;

export function numberOrNull(value: Decimalish): number | null {
  return value === null ? null : Number(value);
}

/** Decimals leave the API as numbers, not strings. */
export function toProductionLog<T extends { waterConsumption: Decimalish }>({
  waterConsumption,
  ...log
}: T) {
  return { ...log, waterLitres: numberOrNull(waterConsumption) };
}

export function toFeedUsage<T extends { quantityKg: Decimalish }>(usage: T) {
  return { ...usage, quantityKg: Number(usage.quantityKg) };
}

export function toWeightSample<T extends { averageWeightGrams: Decimalish }>(sample: T) {
  return { ...sample, averageWeightGrams: Number(sample.averageWeightGrams) };
}
