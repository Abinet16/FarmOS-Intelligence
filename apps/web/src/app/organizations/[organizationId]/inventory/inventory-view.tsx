'use client';

import { SINGLE_MOVEMENT_TYPES } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import {
  api,
  queryString,
  type Farm,
  type InventoryItem,
  type InventoryMovement,
  type Page,
  type StockRow,
} from '@/lib/api';
import { formatDateTime, formatNumber, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/** Stock is the sum of movements; every number here can be traced to its history. */
export function InventoryView() {
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const canMove = useCan('production:record');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}/inventory`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });

  const stock = useQuery({
    queryKey: ['inventory', organization.id, 'stock'],
    queryFn: () => api<StockRow[]>(`${base}/stock`),
  });
  const items = useQuery({
    queryKey: ['inventory', organization.id, 'items'],
    queryFn: () => api<InventoryItem[]>(`${base}/items`),
  });
  const movements = useQuery({
    queryKey: ['inventory', organization.id, 'movements'],
    queryFn: () =>
      api<{ items: InventoryMovement[]; nextCursor: string | null }>(`${base}/movements?limit=20`),
  });
  const farms = useQuery({
    queryKey: ['farms', organization.id, { pageSize: 100 }],
    queryFn: () =>
      api<Page<Farm>>(`/organizations/${organization.id}/farms${queryString({ pageSize: 100 })}`),
    enabled: canMove,
  });

  const post = (path: string, body: object) =>
    api(`${base}/${path}`, { method: 'POST', body: JSON.stringify(body) });
  const createItem = useMutation({
    mutationFn: (b: object) => post('items', b),
    onSuccess: refresh,
  });
  const move = useMutation({ mutationFn: (b: object) => post('movements', b), onSuccess: refresh });
  const transfer = useMutation({
    mutationFn: (b: object) => post('transfers', b),
    onSuccess: refresh,
  });

  const submit =
    (mutation: typeof move, build: (data: FormData) => object) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      mutation.mutate(build(new FormData(form)), { onSuccess: () => form.reset() });
    };

  const itemOptions = items.data?.map((item) => (
    <option key={item.id} value={item.id}>
      {item.name} ({item.unit})
    </option>
  ));
  const farmOptions = farms.data?.items.map((farm) => (
    <option key={farm.id} value={farm.id}>
      {farm.name}
    </option>
  ));
  const ready = (items.data?.length ?? 0) > 0 && (farms.data?.total ?? 0) > 0;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>

      <section aria-labelledby="stock" className="flex flex-col gap-3">
        <h2 id="stock" className="text-lg font-medium">
          Stock by farm
        </h2>
        <ErrorMessage error={stock.error} />
        {stock.data?.length === 0 && <p className="text-zinc-500">No stock recorded yet.</p>}
        {stock.data && stock.data.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Farm</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 text-right font-medium">Reorder at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {stock.data.map((row) => (
                  <tr key={`${row.item.id}:${row.farm.id}`}>
                    <td className="px-3 py-1.5 font-medium">{row.item.name}</td>
                    <td className="px-3 py-1.5">{row.farm.name}</td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${row.belowReorder ? 'font-semibold text-red-600' : ''}`}
                    >
                      {formatNumber(row.balance, 1)} {row.item.unit}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                      {formatNumber(row.reorderLevel, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canMove && ready && (
        <section aria-labelledby="record-movement" className="flex flex-col gap-3">
          <h2 id="record-movement" className="text-lg font-medium">
            Record a movement
          </h2>
          <form
            onSubmit={submit(move, (d) => ({
              itemId: d.get('itemId'),
              farmId: d.get('farmId'),
              movementType: d.get('movementType'),
              quantity: Number(d.get('quantity')),
              ...(String(d.get('reference')).trim() && { reference: d.get('reference') }),
            }))}
            className="grid gap-3 sm:grid-cols-5"
          >
            <select name="itemId" aria-label="Item" className="input">
              {itemOptions}
            </select>
            <select name="farmId" aria-label="Farm" className="input">
              {farmOptions}
            </select>
            <select name="movementType" aria-label="Type" className="input">
              {SINGLE_MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </select>
            <input
              name="quantity"
              type="number"
              required
              min={0.001}
              step="0.001"
              placeholder="Quantity"
              aria-label="Quantity"
              className="input"
            />
            <input name="reference" placeholder="Reference (PO, note)" className="input" />
            <div>
              <button type="submit" disabled={move.isPending} className="btn-primary">
                Record
              </button>
            </div>
          </form>
          <ErrorMessage error={move.error} />

          <h3 className="text-sm font-medium text-zinc-500">Transfer between farms</h3>
          <form
            onSubmit={submit(transfer, (d) => ({
              itemId: d.get('itemId'),
              fromFarmId: d.get('fromFarmId'),
              toFarmId: d.get('toFarmId'),
              quantity: Number(d.get('quantity')),
            }))}
            className="grid gap-3 sm:grid-cols-5"
          >
            <select name="itemId" aria-label="Item" className="input">
              {itemOptions}
            </select>
            <select name="fromFarmId" aria-label="From farm" className="input">
              {farmOptions}
            </select>
            <select name="toFarmId" aria-label="To farm" className="input">
              {farmOptions}
            </select>
            <input
              name="quantity"
              type="number"
              required
              min={0.001}
              step="0.001"
              placeholder="Quantity"
              aria-label="Quantity"
              className="input"
            />
            <div>
              <button type="submit" disabled={transfer.isPending} className="btn-primary">
                Transfer
              </button>
            </div>
          </form>
          <ErrorMessage error={transfer.error} />
        </section>
      )}

      <section aria-labelledby="movements" className="flex flex-col gap-3">
        <h2 id="movements" className="text-lg font-medium">
          Recent movements
        </h2>
        <ErrorMessage error={movements.error} />
        {movements.data?.items.length === 0 && <p className="text-zinc-500">None yet.</p>}
        <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {movements.data?.items.map((m) => (
            <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <strong>{humanize(m.movementType)}</strong> {formatNumber(m.quantity, 1)}{' '}
                {m.item.unit} {m.item.name} · {m.farm.name}
                {m.reference && <span className="text-zinc-500"> · {m.reference}</span>}
              </span>
              <span className="text-zinc-500">
                {m.recorder.name}, {formatDateTime(m.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {canConfigure && (
        <section aria-labelledby="add-item" className="flex flex-col gap-3">
          <h2 id="add-item" className="text-lg font-medium">
            Add an item
          </h2>
          <form
            onSubmit={submit(createItem, (d) => ({
              name: d.get('name'),
              unit: d.get('unit'),
              reorderLevel: String(d.get('reorderLevel')) ? Number(d.get('reorderLevel')) : null,
            }))}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Name
              <input name="name" required minLength={2} maxLength={120} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Unit
              <input
                name="unit"
                required
                maxLength={20}
                placeholder="kg, bag, dose"
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Reorder at <span className="text-zinc-500">(optional)</span>
              <input name="reorderLevel" type="number" min={0} step="0.001" className="input" />
            </label>
            <button type="submit" disabled={createItem.isPending} className="btn-primary">
              Add item
            </button>
          </form>
          <ErrorMessage error={createItem.error} />
        </section>
      )}
    </>
  );
}
