import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateHouseDto, ListHousesQuery, UpdateHouseDto } from './houses.schemas.js';

const houseInclude = {
  farm: { select: { id: true, name: true, archivedAt: true } },
  flockBatches: {
    where: { status: 'ACTIVE' },
    select: { id: true, batchCode: true, breed: true, initialBirds: true, placementDate: true },
    take: 1,
  },
} as const satisfies Prisma.HouseInclude;

type HouseRow = Prisma.HouseGetPayload<{ include: typeof houseInclude }>;

function toHouse({ flockBatches, ...house }: HouseRow) {
  return { ...house, activeBatch: flockBatches[0] ?? null };
}

@Injectable()
export class HousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenant: TenantContext, query: ListHousesQuery) {
    const where: Prisma.HouseWhereInput = {
      organizationId: tenant.organizationId,
      ...(query.farmId && { farmId: query.farmId }),
      ...(!query.includeArchived && { archivedAt: null }),
      ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.house.findMany({
          where,
          include: houseInclude,
          orderBy: [{ farm: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
          ...pageArgs(query),
        }),
        tx.house.count({ where }),
      ]);
      return toPage(items.map(toHouse), total, query);
    });
  }

  get(tenant: TenantContext, houseId: string) {
    return this.prisma.withTenant(tenant, async (tx) =>
      toHouse(await this.findOrThrow(tx, tenant, houseId)),
    );
  }

  create(tenant: TenantContext, dto: CreateHouseDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const [farm] = await tx.$queryRaw<{ archived_at: Date | null }[]>`
        SELECT archived_at FROM farms
        WHERE id = ${dto.farmId}::uuid AND organization_id = ${tenant.organizationId}::uuid
        FOR SHARE`;
      if (!farm) throw new NotFoundException('Farm not found');
      if (farm.archived_at) throw new ConflictException('Cannot add a house to an archived farm');

      const house = await tx.house.create({
        data: { organizationId: tenant.organizationId, ...dto },
        include: houseInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'house.created',
        entityType: 'house',
        entityId: house.id,
        metadata: dto,
      });
      return toHouse(house);
    });
  }

  update(tenant: TenantContext, houseId: string, dto: UpdateHouseDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await this.findOrThrow(tx, tenant, houseId);
      const active = before.flockBatches[0];
      if (dto.capacity !== undefined && active && dto.capacity < active.initialBirds) {
        throw new ConflictException(
          `Capacity cannot drop below the ${active.initialBirds} birds placed in batch ${active.batchCode}`,
        );
      }

      const house = await tx.house.update({
        where: { id: houseId },
        data: dto,
        include: houseInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'house.updated',
        entityType: 'house',
        entityId: houseId,
        metadata: {
          before: { name: before.name, capacity: before.capacity },
          after: { name: house.name, capacity: house.capacity },
        },
      });
      return toHouse(house);
    });
  }

  archive(tenant: TenantContext, houseId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const house = await this.lockOrThrow(tx, tenant, houseId);
      if (house.archived_at) throw new ConflictException('House is already archived');

      const openBatches = await tx.flockBatch.count({
        where: {
          organizationId: tenant.organizationId,
          houseId,
          status: { in: ['PLANNED', 'ACTIVE'] },
        },
      });
      if (openBatches > 0) {
        throw new ConflictException('Close or deplete this house’s flocks before archiving it');
      }

      const updated = await tx.house.update({
        where: { id: houseId },
        data: { archivedAt: new Date() },
        include: houseInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'house.archived',
        entityType: 'house',
        entityId: houseId,
      });
      return toHouse(updated);
    });
  }

  restore(tenant: TenantContext, houseId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const house = await this.lockOrThrow(tx, tenant, houseId);
      if (!house.archived_at) throw new ConflictException('House is not archived');
      if (house.farm_archived_at) {
        throw new ConflictException('Restore the farm before restoring its houses');
      }

      const updated = await tx.house.update({
        where: { id: houseId },
        data: { archivedAt: null },
        include: houseInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'house.restored',
        entityType: 'house',
        entityId: houseId,
      });
      return toHouse(updated);
    });
  }

  private async findOrThrow(tx: Tx, tenant: TenantContext, houseId: string) {
    const house = await tx.house.findFirst({
      where: { id: houseId, organizationId: tenant.organizationId },
      include: houseInclude,
    });
    if (!house) throw new NotFoundException('House not found');
    return house;
  }

  /** Locks the house (and shares its farm) so archiving can't race a placement. */
  private async lockOrThrow(tx: Tx, tenant: TenantContext, houseId: string) {
    const [house] = await tx.$queryRaw<
      { id: string; archived_at: Date | null; farm_archived_at: Date | null }[]
    >`
      SELECT h.id, h.archived_at, f.archived_at AS farm_archived_at
      FROM houses h JOIN farms f ON f.id = h.farm_id
      WHERE h.id = ${houseId}::uuid AND h.organization_id = ${tenant.organizationId}::uuid
      FOR UPDATE OF h FOR SHARE OF f`;
    if (!house) throw new NotFoundException('House not found');
    return house;
  }
}
