import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { canTransition, isEnded, type BatchStatus } from '@farmos/shared-types';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { daysBetween, todayIn } from '../../common/dates.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import {
  PLACEMENT_FIELDS,
  type ChangeStatusDto,
  type CreateFlockBatchDto,
  type ListFlockBatchesQuery,
  type UpdateFlockBatchDto,
} from './flock-batches.schemas.js';

const batchInclude = {
  house: { select: { id: true, name: true, farm: { select: { id: true, name: true } } } },
} as const satisfies Prisma.FlockBatchInclude;

type BatchRow = Prisma.FlockBatchGetPayload<{ include: typeof batchInclude }>;

/** Age in days counts from placement to today, or to the end date once ended. */
function toBatch(batch: BatchRow, today: Date) {
  const ageDays =
    batch.status === 'PLANNED' ? null : daysBetween(batch.placementDate, batch.endDate ?? today);
  return { ...batch, ageDays };
}

@Injectable()
export class FlockBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenant: TenantContext, query: ListFlockBatchesQuery) {
    const where: Prisma.FlockBatchWhereInput = {
      organizationId: tenant.organizationId,
      ...(query.status && { status: query.status }),
      ...(query.purpose && { purpose: query.purpose }),
      ...(query.houseId && { houseId: query.houseId }),
      ...(query.farmId && { house: { farmId: query.farmId } }),
      ...(query.q && {
        OR: [
          { batchCode: { contains: query.q, mode: 'insensitive' } },
          { breed: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total, today] = await Promise.all([
        tx.flockBatch.findMany({
          where,
          include: batchInclude,
          orderBy: [{ placementDate: 'desc' }, { batchCode: 'asc' }],
          ...pageArgs(query),
        }),
        tx.flockBatch.count({ where }),
        this.today(tx, tenant),
      ]);
      return toPage(
        items.map((batch) => toBatch(batch, today)),
        total,
        query,
      );
    });
  }

  get(tenant: TenantContext, batchId: string) {
    return this.prisma.withTenant(tenant, async (tx) =>
      toBatch(await this.findOrThrow(tx, tenant, batchId), await this.today(tx, tenant)),
    );
  }

  /** New batches start PLANNED; placing the birds is an explicit status change. */
  create(tenant: TenantContext, dto: CreateFlockBatchDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      await this.assertHouseFits(tx, tenant, dto.houseId, dto.initialBirds);

      const batch = await tx.flockBatch.create({
        data: { organizationId: tenant.organizationId, ...dto },
        include: batchInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'flock_batch.created',
        entityType: 'flock_batch',
        entityId: batch.id,
        metadata: {
          batchCode: batch.batchCode,
          houseId: batch.houseId,
          initialBirds: batch.initialBirds,
          placementDate: dto.placementDate.toISOString().slice(0, 10),
        },
      });
      return toBatch(batch, await this.today(tx, tenant));
    });
  }

  update(tenant: TenantContext, batchId: string, dto: UpdateFlockBatchDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await this.lockOrThrow(tx, tenant, batchId);
      if (before.status === 'CLOSED') throw new ConflictException('A closed batch is read-only');

      const placementChanges = PLACEMENT_FIELDS.filter((field) => dto[field] !== undefined);
      if (placementChanges.length > 0 && before.status !== 'PLANNED') {
        throw new ConflictException(
          `${placementChanges.join(', ')} can only change while the batch is planned`,
        );
      }
      if (dto.houseId !== undefined || dto.initialBirds !== undefined) {
        await this.assertHouseFits(
          tx,
          tenant,
          dto.houseId ?? before.house_id,
          dto.initialBirds ?? before.initial_birds,
        );
      }

      const batch = await tx.flockBatch.update({
        where: { id: batchId },
        data: dto,
        include: batchInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'flock_batch.updated',
        entityType: 'flock_batch',
        entityId: batchId,
        metadata: { fields: Object.keys(dto) },
      });
      return toBatch(batch, await this.today(tx, tenant));
    });
  }

  changeStatus(tenant: TenantContext, batchId: string, dto: ChangeStatusDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const batch = await this.lockOrThrow(tx, tenant, batchId);
      const from = batch.status;
      if (!canTransition(from, dto.status)) {
        throw new ConflictException(`A ${from} batch cannot become ${dto.status}`);
      }

      const today = await this.today(tx, tenant);
      let endDate: Date | null = null;

      if (dto.status === 'ACTIVE') {
        if (batch.placement_date > today) {
          throw new ConflictException('Birds cannot be placed before their placement date');
        }
        await this.assertHouseFits(tx, tenant, batch.house_id, batch.initial_birds);
        const occupant = await tx.flockBatch.findFirst({
          where: {
            organizationId: tenant.organizationId,
            houseId: batch.house_id,
            status: 'ACTIVE',
          },
          select: { batchCode: true },
        });
        if (occupant) {
          throw new ConflictException(`The house already holds active batch ${occupant.batchCode}`);
        }
      } else if (from === 'PLANNED') {
        // Cancelled before placement: the batch never ran, so it ends where it starts.
        endDate = batch.placement_date;
      } else if (isEnded(from)) {
        endDate = batch.end_date;
      } else {
        endDate = dto.date ?? today;
        if (endDate > today) throw invalidField('date', 'cannot be in the future');
        if (endDate < batch.placement_date) {
          throw invalidField('date', 'cannot be before the placement date');
        }
      }

      const updated = await tx.flockBatch.update({
        where: { id: batchId },
        data: { status: dto.status, endDate },
        include: batchInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'flock_batch.status_changed',
        entityType: 'flock_batch',
        entityId: batchId,
        metadata: {
          from,
          to: dto.status,
          endDate: endDate?.toISOString().slice(0, 10) ?? null,
        },
      });
      return toBatch(updated, today);
    });
  }

  private async findOrThrow(tx: Tx, tenant: TenantContext, batchId: string) {
    const batch = await tx.flockBatch.findFirst({
      where: { id: batchId, organizationId: tenant.organizationId },
      include: batchInclude,
    });
    if (!batch) throw new NotFoundException('Flock batch not found');
    return batch;
  }

  /** Serializes concurrent edits and status changes of one batch. */
  private async lockOrThrow(tx: Tx, tenant: TenantContext, batchId: string) {
    const [batch] = await tx.$queryRaw<
      {
        status: BatchStatus;
        house_id: string;
        initial_birds: number;
        placement_date: Date;
        end_date: Date | null;
      }[]
    >`
      SELECT status, house_id, initial_birds, placement_date, end_date FROM flock_batches
      WHERE id = ${batchId}::uuid AND organization_id = ${tenant.organizationId}::uuid
      FOR UPDATE`;
    if (!batch) throw new NotFoundException('Flock batch not found');
    return batch;
  }

  /**
   * The house must exist, be open, and hold the birds. Its row and its farm's
   * are share-locked, so they can't be archived until this transaction ends.
   */
  private async assertHouseFits(tx: Tx, tenant: TenantContext, houseId: string, birds: number) {
    const [house] = await tx.$queryRaw<
      { capacity: number; archived_at: Date | null; farm_archived_at: Date | null }[]
    >`
      SELECT h.capacity, h.archived_at, f.archived_at AS farm_archived_at
      FROM houses h JOIN farms f ON f.id = h.farm_id
      WHERE h.id = ${houseId}::uuid AND h.organization_id = ${tenant.organizationId}::uuid
      FOR SHARE OF h, f`;
    if (!house) throw invalidField('houseId', 'house not found');
    if (house.archived_at || house.farm_archived_at) {
      throw new ConflictException('The house is archived');
    }
    if (birds > house.capacity) {
      throw invalidField('initialBirds', `exceeds the house capacity of ${house.capacity}`);
    }
  }

  private async today(tx: Tx, tenant: TenantContext) {
    const { timezone } = await tx.organization.findUniqueOrThrow({
      where: { id: tenant.organizationId },
      select: { timezone: true },
    });
    return todayIn(timezone);
  }
}
