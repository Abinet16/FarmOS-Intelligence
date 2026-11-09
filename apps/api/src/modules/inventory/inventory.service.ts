import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MOVEMENT_DIRECTION } from '@farmos/shared-types';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { computeStock } from './stock.js';
import type {
  CreateItemDto,
  MovementDto,
  MovementsQuery,
  StockQuery,
  TransferDto,
  UpdateItemDto,
} from './inventory.schemas.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const movementInclude = {
  item: { select: { id: true, name: true, unit: true } },
  farm: { select: { id: true, name: true } },
  recorder: { select: { id: true, name: true } },
} as const satisfies Prisma.InventoryMovementInclude;

function toItem<T extends { reorderLevel: Decimal | null }>(item: T) {
  return { ...item, reorderLevel: item.reorderLevel === null ? null : Number(item.reorderLevel) };
}

function toMovement<T extends { quantity: Decimal }>(movement: T) {
  return { ...movement, quantity: Number(movement.quantity) };
}

/**
 * Stock is never stored. Every change is an inventory_movements row, and a
 * balance is the signed sum of an item's movements at a farm, so the history
 * always explains the number. Quantities use exact decimals throughout.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listItems(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, async (tx) =>
      (
        await tx.inventoryItem.findMany({
          where: { organizationId: tenant.organizationId },
          orderBy: { name: 'asc' },
        })
      ).map(toItem),
    );
  }

  createItem(tenant: TenantContext, dto: CreateItemDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const item = await tx.inventoryItem.create({
        data: { organizationId: tenant.organizationId, ...dto },
      });
      await this.audit.record(tx, tenant, {
        action: 'inventory_item.created',
        entityType: 'inventory_item',
        entityId: item.id,
        metadata: dto,
      });
      return toItem(item);
    });
  }

  updateItem(tenant: TenantContext, itemId: string, dto: UpdateItemDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await tx.inventoryItem.findFirst({
        where: { id: itemId, organizationId: tenant.organizationId },
      });
      if (!before) throw new NotFoundException('Inventory item not found');

      const item = await tx.inventoryItem.update({ where: { id: itemId }, data: dto });
      await this.audit.record(tx, tenant, {
        action: 'inventory_item.updated',
        entityType: 'inventory_item',
        entityId: itemId,
        metadata: {
          before: { name: before.name, reorderLevel: toItem(before).reorderLevel },
          after: { name: item.name, reorderLevel: toItem(item).reorderLevel },
        },
      });
      return toItem(item);
    });
  }

  /** Receipts, issues and adjustments. Stock at a farm can never go negative. */
  recordMovement(tenant: TenantContext, dto: MovementDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      await this.lockItem(tx, tenant, dto.itemId);
      await this.assertOpenFarm(tx, tenant, dto.farmId, 'farmId');
      const occurredAt = this.occurredAt(dto.occurredAt);

      const quantity = new Decimal(dto.quantity);
      if (MOVEMENT_DIRECTION[dto.movementType] < 0) {
        await this.assertAvailable(tx, tenant, dto.itemId, dto.farmId, quantity);
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          organizationId: tenant.organizationId,
          itemId: dto.itemId,
          farmId: dto.farmId,
          movementType: dto.movementType,
          quantity,
          occurredAt,
          reference: dto.reference,
          recordedBy: tenant.userId,
        },
        include: movementInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'inventory.movement_recorded',
        entityType: 'inventory_movement',
        entityId: movement.id,
        metadata: {
          itemId: dto.itemId,
          farmId: dto.farmId,
          movementType: dto.movementType,
          quantity: dto.quantity,
        },
      });
      return toMovement(movement);
    });
  }

  /** Moves stock between farms as a TRANSFER_OUT/TRANSFER_IN pair sharing one id. */
  transfer(tenant: TenantContext, dto: TransferDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      await this.lockItem(tx, tenant, dto.itemId);
      await this.assertOpenFarm(tx, tenant, dto.fromFarmId, 'fromFarmId');
      await this.assertOpenFarm(tx, tenant, dto.toFarmId, 'toFarmId');
      const occurredAt = this.occurredAt(dto.occurredAt);

      const quantity = new Decimal(dto.quantity);
      await this.assertAvailable(tx, tenant, dto.itemId, dto.fromFarmId, quantity);

      const transferId = randomUUID();
      const common = {
        organizationId: tenant.organizationId,
        itemId: dto.itemId,
        quantity,
        occurredAt,
        reference: dto.reference,
        transferId,
        recordedBy: tenant.userId,
      };
      const out = await tx.inventoryMovement.create({
        data: { ...common, farmId: dto.fromFarmId, movementType: 'TRANSFER_OUT' },
        include: movementInclude,
      });
      const into = await tx.inventoryMovement.create({
        data: { ...common, farmId: dto.toFarmId, movementType: 'TRANSFER_IN' },
        include: movementInclude,
      });
      await this.audit.record(tx, tenant, {
        action: 'inventory.transferred',
        entityType: 'inventory_transfer',
        entityId: transferId,
        metadata: {
          itemId: dto.itemId,
          fromFarmId: dto.fromFarmId,
          toFarmId: dto.toFarmId,
          quantity: dto.quantity,
        },
      });
      return { transferId, movements: [toMovement(out), toMovement(into)] };
    });
  }

  /** Balance per item and farm, flagged when at or below the item's reorder level. */
  stock(tenant: TenantContext, query: StockQuery) {
    return this.prisma.withTenant(tenant, (tx) => computeStock(tx, tenant.organizationId, query));
  }

  /** Newest first, keyset-paginated on (occurred_at, id). */
  movements(tenant: TenantContext, query: MovementsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const cursor = query.before
        ? await tx.inventoryMovement.findFirst({
            where: { id: query.before, organizationId: tenant.organizationId },
            select: { occurredAt: true, id: true },
          })
        : null;
      const items = await tx.inventoryMovement.findMany({
        where: {
          organizationId: tenant.organizationId,
          ...(query.itemId && { itemId: query.itemId }),
          ...(query.farmId && { farmId: query.farmId }),
          ...(cursor && {
            OR: [
              { occurredAt: { lt: cursor.occurredAt } },
              { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
            ],
          }),
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: movementInclude,
      });
      const hasMore = items.length > query.limit;
      const page = hasMore ? items.slice(0, query.limit) : items;
      return {
        items: page.map(toMovement),
        nextCursor: hasMore ? page[page.length - 1]?.id : null,
      };
    });
  }

  /** Serializes all movements of one item, so two issues can't both spend the same stock. */
  private async lockItem(tx: Tx, tenant: TenantContext, itemId: string) {
    const [item] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM inventory_items
      WHERE id = ${itemId}::uuid AND organization_id = ${tenant.organizationId}::uuid
      FOR UPDATE`;
    if (!item) throw invalidField('itemId', 'unknown inventory item');
  }

  private async assertOpenFarm(tx: Tx, tenant: TenantContext, farmId: string, path: string) {
    const farm = await tx.farm.findFirst({
      where: { id: farmId, organizationId: tenant.organizationId },
      select: { archivedAt: true },
    });
    if (!farm) throw invalidField(path, 'unknown farm');
    if (farm.archivedAt) throw new ConflictException('The farm is archived');
  }

  private async assertAvailable(
    tx: Tx,
    tenant: TenantContext,
    itemId: string,
    farmId: string,
    quantity: Decimal,
  ) {
    const sums = await tx.inventoryMovement.groupBy({
      by: ['movementType'],
      where: { organizationId: tenant.organizationId, itemId, farmId },
      _sum: { quantity: true },
    });
    const balance = sums.reduce(
      (total, row) =>
        total.plus(
          (row._sum.quantity ?? new Decimal(0)).times(MOVEMENT_DIRECTION[row.movementType]),
        ),
      new Decimal(0),
    );
    if (balance.lt(quantity)) {
      throw invalidField('quantity', `only ${balance.toString()} in stock at this farm`);
    }
  }

  private occurredAt(value: Date | undefined) {
    const occurredAt = value ?? new Date();
    if (occurredAt > new Date()) throw invalidField('occurredAt', 'cannot be in the future');
    return occurredAt;
  }
}
