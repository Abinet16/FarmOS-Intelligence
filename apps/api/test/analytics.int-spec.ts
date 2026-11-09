import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';

/**
 * Dashboard KPIs over HTTP, checked against values worked out by hand:
 *
 *   North, flock A, 1,000 layers        South, flock B, 500 layers
 *   date   deaths eggs  feed            date   deaths eggs feed
 *   Oct 1    10    —    110             Oct 1     —     —    —
 *   Oct 2     —   900   112             Oct 2     —    400   55
 *   Oct 3    40   891    —              Oct 3     5    410   56
 *   Oct 4     5    —     95             Oct 4     —     —    —
 *
 * Over Oct 1–4, A has 1,791 eggs over 1,980 laying bird-days and B has 810
 * over 1,000, so the combined hen-day rate is 2,601 / 2,980 = 87.28%. Averaging
 * the two flocks' rates (90.45% and 81%) would wrongly give 85.73%.
 */
describe('analytics', () => {
  let app: INestApplication;
  let owner: Agent;
  let worker: Agent;
  let outsider: Agent;
  let base: string;
  let north: string;
  let south: string;
  let flockA: string;

  const entry = (batchId: string, body: object) =>
    send(owner, 'post', `${base}/flock-batches/${batchId}/daily-entries`, body).expect(201);
  const get = (path: string) => owner.get(`${base}/analytics/${path}`).expect(200);
  const window = 'from=2026-10-01&to=2026-10-04';

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const w = await signUp(app, 'worker');
    worker = w.agent;
    ({ agent: outsider } = await signUp(app, 'outsider'));
    ({
      base,
      farmId: north,
      batchId: flockA,
    } = await createFarmWithFlock(owner, 'Analytics Farms'));
    await addMember(owner, base, w.email, 'FIELD_WORKER');

    south = (await send(owner, 'post', `${base}/farms`, { name: 'South' }).expect(201)).body.id;
    const house = (
      await send(owner, 'post', `${base}/houses`, { farmId: south, name: 'S1', capacity: 600 })
    ).body.id;
    const flockB = (
      await send(owner, 'post', `${base}/flock-batches`, {
        houseId: house,
        batchCode: 'SOUTH-01',
        breed: 'ISA Brown',
        placementDate: '2026-10-01',
        initialBirds: 500,
      }).expect(201)
    ).body.id;
    await send(owner, 'post', `${base}/flock-batches/${flockB}/status`, { status: 'ACTIVE' });

    const feedType = (await send(owner, 'post', `${base}/feed-types`, { name: 'Mash' })).body.id;
    const feed = (kg: number) => [{ feedTypeId: feedType, quantityKg: kg }];
    const deaths = (n: number) => [{ quantity: n, reasonCode: 'UNKNOWN' }];

    await entry(flockA, { date: '2026-10-01', deaths: deaths(10), feed: feed(110) });
    await entry(flockA, { date: '2026-10-02', eggsCollected: 900, feed: feed(112) });
    await entry(flockA, { date: '2026-10-03', eggsCollected: 891, deaths: deaths(40) });
    await entry(flockA, { date: '2026-10-04', deaths: deaths(5), feed: feed(95) });
    await entry(flockB, { date: '2026-10-02', eggsCollected: 400, feed: feed(55) });
    await entry(flockB, {
      date: '2026-10-03',
      eggsCollected: 410,
      deaths: deaths(5),
      feed: feed(56),
    });
  });

  afterAll(() => app.close());

  it('is limited to roles with reports:view, inside the organization', async () => {
    await worker.get(`${base}/analytics/overview`).expect(403);
    await outsider.get(`${base}/analytics/overview`).expect(404);
  });

  it('sums the organization’s production with bird-weighted rates', async () => {
    const { body } = await get(`overview?${window}`);
    expect(body.range).toEqual({ from: '2026-10-01', to: '2026-10-04' });
    expect(body.flocks).toMatchObject({ active: 2, liveBirds: 1440, inRange: 2 });
    expect(body.production.totals).toMatchObject({
      startingBirds: 1500,
      deaths: 60,
      eggs: 2601,
      layingBirdDays: 2980,
      feedKg: 428,
      feedBirdDays: 3930,
    });
    expect(body.production.kpis.henDayPct).toBeCloseTo(87.2819, 4);
    expect(body.production.kpis.mortalityPct).toBeCloseTo(4, 10);
    expect(body.production.kpis.feedPerBirdKg).toBeCloseTo(428 / 3930, 10);
  });

  it('filters the overview by farm', async () => {
    const { body } = await get(`overview?${window}&farmId=${south}`);
    expect(body.flocks).toMatchObject({ active: 1, liveBirds: 495 });
    expect(body.production.kpis.henDayPct).toBeCloseTo(81, 10);
  });

  it('builds a daily trend across flocks', async () => {
    const { body } = await get(`trend?${window}`);
    const byDate = Object.fromEntries(body.days.map((d: { date: string }) => [d.date, d]));
    expect(body.days.map((d: { date: string }) => d.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(byDate['2026-10-01']).toMatchObject({ openingBirds: 1500, deaths: 10, eggs: null });
    expect(byDate['2026-10-03']).toMatchObject({ openingBirds: 1490, deaths: 45, eggs: 1301 });
    expect(byDate['2026-10-03'].henDayPct).toBeCloseTo(87.3154, 4); // 1,301 / 1,490
    expect(byDate['2026-10-03'].mortalityRatePct).toBeCloseTo(3.0201, 4); // 45 / 1,490
  });

  it('compares farms on the same footing', async () => {
    const { body } = await get(`farms?${window}`);
    const [first, second] = body.farms;
    expect(first.farm.name).toBe('Analytics Farms farm');
    expect(first).toMatchObject({ flocks: 1, birdsAtEnd: 945 });
    expect(first.kpis.henDayPct).toBeCloseTo(90.4545, 4); // 1,791 / 1,980
    expect(first.kpis.mortalityPct).toBeCloseTo(5.5, 10);
    expect(second.farm.id).toBe(south);
    expect(second.kpis.henDayPct).toBeCloseTo(81, 10);
    expect(second.kpis.mortalityPct).toBeCloseTo(1, 10);
    expect(first.farm.id).toBe(north);
  });

  it('summarises a single flock with its daily rows', async () => {
    const { body } = await get(`flocks/${flockA}?${window}`);
    expect(body.summary).toMatchObject({ days: 4, birdsAtEnd: 945, fcr: null });
    expect(body.days.map((d: { date: string }) => d.date)[0]).toBe('2026-10-01');
    await owner.get(`${base}/analytics/flocks/00000000-0000-4000-8000-000000000000`).expect(404);
  });

  it('reports FCR when two weigh days bracket the range', async () => {
    const { base: other, batchId } = await createFarmWithFlock(owner, 'Broiler Co');
    const feedType = (await send(owner, 'post', `${other}/feed-types`, { name: 'Starter' })).body
      .id;
    const day = (date: string, body: object) =>
      send(owner, 'post', `${other}/flock-batches/${batchId}/daily-entries`, {
        date,
        ...body,
      }).expect(201);
    await day('2026-10-01', { weight: { sampleSize: 50, averageWeightGrams: 40 } });
    await day('2026-10-02', { feed: [{ feedTypeId: feedType, quantityKg: 50 }] });
    await day('2026-10-03', { feed: [{ feedTypeId: feedType, quantityKg: 60 }] });
    await day('2026-10-04', {
      feed: [{ feedTypeId: feedType, quantityKg: 70 }],
      weight: { sampleSize: 50, averageWeightGrams: 160 },
    });

    // 180 kg of feed for a gain of (160 g − 40 g) × 1,000 birds = 120 kg.
    const { body } = await owner.get(`${other}/analytics/flocks?${window}`).expect(200);
    expect(body.flocks).toHaveLength(1);
    expect(body.flocks[0].fcr).toBeCloseTo(1.5, 10);
  });

  it('rejects a range longer than a year', async () => {
    await owner.get(`${base}/analytics/trend?from=2025-01-01&to=2026-10-04`).expect(400);
  });
});
