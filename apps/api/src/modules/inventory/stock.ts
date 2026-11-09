import { MOVEMENT_DIRECTION } from '@farmos/shared-types';
import { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../database/prisma.service.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface StockFilter {
  farmId?: string;
  itemId?: string;
  belowReorder?: boolean;
}

/**
 * Balance per item and farm: the signed sum of its movements, in exact
 * decimals. Shared by the inventory API, alerts and the dashboard.
 */
export async function computeStock(tx: Tx, organizationId: string, query: StockFilter) {
  const sums = await tx.inventoryMovement.groupBy({
    by: ['itemId', 'farmId', 'movementType'],
    where: {
      organizationId,
      ...(query.itemId && { itemId: query.itemId }),
      ...(query.farmId && { farmId: query.farmId }),
    },
    _sum: { quantity: true },
  });

  const balances = new Map<string, { itemId: string; farmId: string; balance: Decimal }>();
  for (const row of sums) {
    const key = `${row.itemId}:${row.farmId}`;
    const entry = balances.get(key) ?? {
      itemId: row.itemId,
      farmId: row.farmId,
      balance: new Decimal(0),
    };
    const amount = row._sum.quantity ?? new Decimal(0);
    entry.balance =
      MOVEMENT_DIRECTION[row.movementType] > 0
        ? entry.balance.plus(amount)
        : entry.balance.minus(amount);
    balances.set(key, entry);
  }

  const [items, farms] = await Promise.all([
    tx.inventoryItem.findMany({ where: { organizationId: organizationId } }),
    tx.farm.findMany({
      where: { organizationId: organizationId },
      select: { id: true, name: true, archivedAt: true },
    }),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const farmById = new Map(farms.map((farm) => [farm.id, farm]));

  const rows = [...balances.values()].map(({ itemId, farmId, balance }) => {
    const item = itemById.get(itemId)!;
    return {
      item: { id: item.id, name: item.name, unit: item.unit },
      farm: farmById.get(farmId)!,
      balance: Number(balance),
      reorderLevel: item.reorderLevel === null ? null : Number(item.reorderLevel),
      belowReorder: item.reorderLevel !== null && balance.lte(item.reorderLevel),
    };
  });
  return rows
    .filter((row) => !query.belowReorder || row.belowReorder)
    .sort(
      (a, b) => a.item.name.localeCompare(b.item.name) || a.farm.name.localeCompare(b.farm.name),
    );
}
