import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateFarmDto, ListFarmsQuery, UpdateFarmDto } from './farms.schemas.js';

const farmInclude = {
  _count: { select: { houses: { where: { archivedAt: null } } } },
} as const;

type FarmRow = Prisma.FarmGetPayload<{ include: typeof farmInclude }>;

function toFarm({ _count, ...farm }: FarmRow) {
  return { ...farm, houseCount: _count.houses };
}

@Injectable()
export class FarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenant: TenantContext, query: ListFarmsQuery) {
    const where: Prisma.FarmWhereInput = {
      organizationId: tenant.organizationId,
      ...(!query.includeArchived && { archivedAt: null }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { location: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.farm.findMany({
          where,
          include: farmInclude,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          ...pageArgs(query),
        }),
        tx.farm.count({ where }),
      ]);
      return toPage(items.map(toFarm), total, query);
    });
  }

  get(tenant: TenantContext, farmId: string) {
    return this.prisma.withTenant(tenant, async (tx) =>
      toFarm(await this.findOrThrow(tx, tenant, farmId)),
    );
  }

  create(tenant: TenantContext, dto: CreateFarmDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const farm = await tx.farm.create({
        data: { organizationId: tenant.organizationId, ...dto },
        include: farmInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'farm.created',
        entityType: 'farm',
        entityId: farm.id,
        metadata: dto,
      });
      return toFarm(farm);
    });
  }

  update(tenant: TenantContext, farmId: string, dto: UpdateFarmDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await this.findOrThrow(tx, tenant, farmId);
      const farm = await tx.farm.update({ where: { id: farmId }, data: dto, include: farmInclude });
      await this.audit.record(tx, tenant, {
        action: 'farm.updated',
        entityType: 'farm',
        entityId: farmId,
        metadata: {
          before: { name: before.name, location: before.location },
          after: { name: farm.name, location: farm.location },
        },
      });
      return toFarm(farm);
    });
  }

  /**
   * Archives the farm and its open houses together, stamped with the same
   * instant so restore() can bring back exactly those houses. A farm with a
   * planned or active flock cannot be archived.
   */
  archive(tenant: TenantContext, farmId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const farm = await this.lockOrThrow(tx, tenant, farmId);
      if (farm.archived_at) throw new ConflictException('Farm is already archived');

      const openBatches = await tx.flockBatch.count({
        where: {
          organizationId: tenant.organizationId,
          house: { farmId },
          status: { in: ['PLANNED', 'ACTIVE'] },
        },
      });
      if (openBatches > 0) {
        throw new ConflictException('Close or deplete this farm’s flocks before archiving it');
      }

      const archivedAt = new Date();
      const houses = await tx.house.updateMany({
        where: { organizationId: tenant.organizationId, farmId, archivedAt: null },
        data: { archivedAt },
      });
      const updated = await tx.farm.update({
        where: { id: farmId },
        data: { archivedAt },
        include: farmInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'farm.archived',
        entityType: 'farm',
        entityId: farmId,
        metadata: { housesArchived: houses.count },
      });
      return toFarm(updated);
    });
  }

  restore(tenant: TenantContext, farmId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const farm = await this.lockOrThrow(tx, tenant, farmId);
      if (!farm.archived_at) throw new ConflictException('Farm is not archived');

      const houses = await tx.house.updateMany({
        where: { organizationId: tenant.organizationId, farmId, archivedAt: farm.archived_at },
        data: { archivedAt: null },
      });
      const updated = await tx.farm.update({
        where: { id: farmId },
        data: { archivedAt: null },
        include: farmInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'farm.restored',
        entityType: 'farm',
        entityId: farmId,
        metadata: { housesRestored: houses.count },
      });
      return toFarm(updated);
    });
  }

  private async findOrThrow(tx: Tx, tenant: TenantContext, farmId: string) {
    const farm = await tx.farm.findFirst({
      where: { id: farmId, organizationId: tenant.organizationId },
      include: farmInclude,
    });
    if (!farm) throw new NotFoundException('Farm not found');
    return farm;
  }

  /**
   * Row lock that serializes archiving against flocks being placed in the
   * farm's houses (see HousesService.lockOpenHouse).
   */
  private async lockOrThrow(tx: Tx, tenant: TenantContext, farmId: string) {
    const [farm] = await tx.$queryRaw<{ id: string; archived_at: Date | null }[]>`
      SELECT id, archived_at FROM farms
      WHERE id = ${farmId}::uuid AND organization_id = ${tenant.organizationId}::uuid
      FOR UPDATE`;
    if (!farm) throw new NotFoundException('Farm not found');
    return farm;
  }
}
