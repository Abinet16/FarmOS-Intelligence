import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';

/**
 * Alert evaluation over recorded data: a steady week of 1,000 layers, then a
 * bad day on Oct 8 (12 deaths, hen-day down to 80%).
 */
describe('alerts', () => {
  let app: INestApplication;
  let owner: Agent;
  let worker: Agent;
  let base: string;
  let farmId: string;
  let batchId: string;

  const evaluate = (date: string, agent: Agent = owner) =>
    send(agent, 'post', `${base}/alerts/evaluate`, { date });
  const openAlerts = async () =>
    (await owner.get(`${base}/alerts?open=true&pageSize=100`).expect(200)).body.items as {
      id: string;
      ruleCode: string;
      severity: string;
      status: string;
      details: Record<string, unknown>;
    }[];

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const w = await signUp(app, 'worker');
    worker = w.agent;
    ({ base, farmId, batchId } = await createFarmWithFlock(owner, 'Alert Farms'));
    await addMember(owner, base, w.email, 'FIELD_WORKER');

    const feedType = (await send(owner, 'post', `${base}/feed-types`, { name: 'Mash' })).body.id;
    for (let day = 1; day <= 7; day++) {
      await send(owner, 'post', `${base}/flock-batches/${batchId}/daily-entries`, {
        date: `2026-10-0${day}`,
        eggsCollected: 900,
        feed: [{ feedTypeId: feedType, quantityKg: 110 }],
      }).expect(201);
    }
    await send(owner, 'post', `${base}/flock-batches/${batchId}/daily-entries`, {
      date: '2026-10-08',
      eggsCollected: 800,
      deaths: [{ quantity: 12, reasonCode: 'UNKNOWN' }],
      feed: [{ feedTypeId: feedType, quantityKg: 108 }],
    }).expect(201);
  });

  afterAll(() => app.close());

  it('raises alerts for a bad day against the flock’s baseline', async () => {
    const { body } = await evaluate('2026-10-08').expect(200);
    expect(body).toMatchObject({ date: '2026-10-08', flocksChecked: 1, created: 2 });

    const alerts = await openAlerts();
    expect(alerts.map((a) => [a.ruleCode, a.severity]).sort()).toEqual([
      ['HEN_DAY_DROP', 'HIGH'], // 90% → 80%: 10 points, twice the 5-point threshold
      ['HIGH_DAILY_MORTALITY', 'CRITICAL'], // 12 / 1,000 = 1.2%, over twice 0.5%
    ]);
    const drop = alerts.find((a) => a.ruleCode === 'HEN_DAY_DROP')!;
    expect(drop.details).toMatchObject({ henDayPct: 80, baselinePct: 90, dropPoints: 10 });
  });

  it('never duplicates alerts when evaluated again', async () => {
    const { body } = await evaluate('2026-10-08').expect(200);
    expect(body.created).toBe(0);
    expect(await openAlerts()).toHaveLength(2);
  });

  it('flags missing records for a day with nothing entered', async () => {
    const { body } = await evaluate('2026-10-09').expect(200);
    expect(body.created).toBe(1);
    const missing = (await openAlerts()).find((a) => a.ruleCode === 'MISSING_RECORDS')!;
    expect(missing).toMatchObject({ severity: 'LOW', details: { missing: ['eggs', 'feed'] } });
  });

  it('keeps one alert for a persistent condition until it is resolved', async () => {
    const vaccine = (await send(owner, 'post', `${base}/vaccines`, { name: 'ND' })).body.id;
    await send(owner, 'post', `${base}/flock-batches/${batchId}/vaccinations`, {
      vaccineId: vaccine,
      scheduledDate: '2026-10-05',
    }).expect(201);
    const item = (
      await send(owner, 'post', `${base}/inventory/items`, {
        name: 'Layer mash',
        unit: 'kg',
        reorderLevel: 100,
      })
    ).body.id;
    await send(owner, 'post', `${base}/inventory/movements`, {
      itemId: item,
      farmId,
      movementType: 'RECEIPT',
      quantity: 50,
    }).expect(201);

    await evaluate('2026-10-10').expect(200);
    await evaluate('2026-10-11').expect(200);
    const persistent = (await openAlerts()).filter((a) =>
      ['VACCINATION_OVERDUE', 'LOW_STOCK'].includes(a.ruleCode),
    );
    expect(persistent.map((a) => a.ruleCode).sort()).toEqual(['LOW_STOCK', 'VACCINATION_OVERDUE']);

    const lowStock = persistent.find((a) => a.ruleCode === 'LOW_STOCK')!;
    await send(owner, 'post', `${base}/alerts/${lowStock.id}/resolve`).expect(200);
    await evaluate('2026-10-12').expect(200);
    // Still below reorder after resolving: a fresh alert is raised.
    expect((await openAlerts()).filter((a) => a.ruleCode === 'LOW_STOCK')).toHaveLength(1);
  });

  it('moves alerts from open to acknowledged to resolved', async () => {
    const [alert] = (await openAlerts()).filter((a) => a.ruleCode === 'HIGH_DAILY_MORTALITY');
    await send(worker, 'post', `${base}/alerts/${alert!.id}/acknowledge`).expect(403);
    const { body: acked } = await send(
      owner,
      'post',
      `${base}/alerts/${alert!.id}/acknowledge`,
    ).expect(200);
    expect(acked).toMatchObject({ status: 'ACKNOWLEDGED', acknowledger: { name: 'owner' } });
    await send(owner, 'post', `${base}/alerts/${alert!.id}/acknowledge`).expect(409);
    const { body: resolved } = await send(
      owner,
      'post',
      `${base}/alerts/${alert!.id}/resolve`,
    ).expect(200);
    expect(resolved).toMatchObject({ status: 'RESOLVED', resolver: { name: 'owner' } });
    await send(owner, 'post', `${base}/alerts/${alert!.id}/resolve`).expect(409);
  });

  it('lets any member read alerts but only reviewers evaluate them', async () => {
    await worker.get(`${base}/alerts`).expect(200);
    await evaluate('2026-10-08', worker).expect(403);
    await evaluate('2999-01-01').expect(400);
  });

  it('applies the organization’s thresholds and disabled rules', async () => {
    const { body: defaults } = await owner.get(`${base}/alert-settings`).expect(200);
    expect(defaults).toEqual({
      dailyMortalityPct: 0.5,
      henDayDropPoints: 5,
      feedDropPct: 20,
      disabledRules: [],
    });
    const quiet = { ...defaults, disabledRules: ['MISSING_RECORDS'] };
    await send(worker, 'put', `${base}/alert-settings`, quiet).expect(403);
    await send(owner, 'put', `${base}/alert-settings`, { ...quiet, feedDropPct: 0 }).expect(400);
    await send(owner, 'put', `${base}/alert-settings`, quiet).expect(200);

    const missingBefore = (await openAlerts()).filter((a) => a.ruleCode === 'MISSING_RECORDS');
    const { body } = await evaluate('2026-10-13').expect(200);
    const missingAfter = (await openAlerts()).filter((a) => a.ruleCode === 'MISSING_RECORDS');
    expect(missingAfter).toHaveLength(missingBefore.length);
    expect(body.created).toBe(0);
  });
});
