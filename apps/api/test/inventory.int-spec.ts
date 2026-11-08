import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';

/** Stock derived from movements: receipts, issues, adjustments and transfers. */
describe('inventory', () => {
  let app: INestApplication;
  let owner: Agent;
  let worker: Agent;
  let base: string;
  let north: string;
  let south: string;
  let feed: string;

  const move = (agent: Agent, body: object) =>
    send(agent, 'post', `${base}/inventory/movements`, body);
  const stockOf = async (farmId: string) => {
    const { body } = await owner
      .get(`${base}/inventory/stock?itemId=${feed}&farmId=${farmId}`)
      .expect(200);
    return body[0]?.balance ?? 0;
  };

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const w = await signUp(app, 'worker');
    worker = w.agent;
    ({ base, farmId: north } = await createFarmWithFlock(owner, 'Stock Farms'));
    await addMember(owner, base, w.email, 'FIELD_WORKER');
    south = (await send(owner, 'post', `${base}/farms`, { name: 'South' }).expect(201)).body.id;
  });

  afterAll(() => app.close());

  it('lets managers define items', async () => {
    const { body } = await send(owner, 'post', `${base}/inventory/items`, {
      name: 'Layer mash',
      unit: 'kg',
      reorderLevel: 500,
    }).expect(201);
    expect(body).toMatchObject({ unit: 'kg', reorderLevel: 500 });
    feed = body.id;
    await send(worker, 'post', `${base}/inventory/items`, { name: 'Grit', unit: 'kg' }).expect(403);
  });

  it('derives stock from receipts, issues and adjustments, exactly', async () => {
    await move(worker, {
      itemId: feed,
      farmId: north,
      movementType: 'RECEIPT',
      quantity: 1000.5,
      reference: 'PO-1042',
    }).expect(201);
    await move(worker, {
      itemId: feed,
      farmId: north,
      movementType: 'ISSUE',
      quantity: 0.1,
    }).expect(201);
    await move(worker, {
      itemId: feed,
      farmId: north,
      movementType: 'ADJUSTMENT_OUT',
      quantity: 0.2,
    }).expect(201);
    // Decimal arithmetic: 1000.5 − 0.1 − 0.2 is exactly 1000.2, not 1000.1999…
    expect(await stockOf(north)).toBe(1000.2);
  });

  it('never lets stock go negative', async () => {
    const { body } = await move(worker, {
      itemId: feed,
      farmId: north,
      movementType: 'ISSUE',
      quantity: 1000.3,
    }).expect(400);
    expect(body.issues[0].message).toMatch(/only 1000.2 in stock/);
    await move(worker, { itemId: feed, farmId: south, movementType: 'ISSUE', quantity: 1 }).expect(
      400,
    );
  });

  it('transfers between farms as a linked pair', async () => {
    const { body } = await send(worker, 'post', `${base}/inventory/transfers`, {
      itemId: feed,
      fromFarmId: north,
      toFarmId: south,
      quantity: 600,
    }).expect(201);
    expect(body.movements.map((m: { movementType: string }) => m.movementType)).toEqual([
      'TRANSFER_OUT',
      'TRANSFER_IN',
    ]);
    expect(new Set(body.movements.map((m: { transferId: string }) => m.transferId)).size).toBe(1);
    expect(await stockOf(north)).toBe(400.2);
    expect(await stockOf(south)).toBe(600);

    await send(worker, 'post', `${base}/inventory/transfers`, {
      itemId: feed,
      fromFarmId: north,
      toFarmId: north,
      quantity: 1,
    }).expect(400);
  });

  it('flags stock at or below the reorder level', async () => {
    const { body } = await worker.get(`${base}/inventory/stock?belowReorder=true`).expect(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ farm: { id: north }, balance: 400.2, belowReorder: true });
  });

  it('lists movements newest first with keyset paging', async () => {
    const first = await owner.get(`${base}/inventory/movements?itemId=${feed}&limit=2`).expect(200);
    expect(first.body.items).toHaveLength(2);
    const second = await owner
      .get(`${base}/inventory/movements?itemId=${feed}&limit=10&before=${first.body.nextCursor}`)
      .expect(200);
    expect(first.body.items.length + second.body.items.length).toBe(5);
    expect(second.body.nextCursor).toBeNull();
  });

  it('refuses future dates and unknown farms', async () => {
    await move(worker, {
      itemId: feed,
      farmId: south,
      movementType: 'RECEIPT',
      quantity: 1,
      occurredAt: '2999-01-01T00:00:00Z',
    }).expect(400);
    await move(worker, {
      itemId: feed,
      farmId: '00000000-0000-4000-8000-000000000000',
      movementType: 'RECEIPT',
      quantity: 1,
    }).expect(400);
  });
});
