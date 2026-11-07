import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { WEB_ORIGIN } from './support/test-env.js';

type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

/**
 * Daily operational records over HTTP: the atomic daily entry, the rules that
 * keep records consistent with the flock, approval, and the daily metrics.
 */
describe('flock records', () => {
  let app: INestApplication;
  let owner: Agent;
  let worker: Agent;
  let auditor: Agent;
  let base: string;
  let houseId: string;
  let layers: string;
  let feedType: string;

  const send = (agent: Agent, method: 'post' | 'patch', url: string, body: object = {}) =>
    agent[method](url).set('Origin', WEB_ORIGIN).send(body);
  const entry = (agent: Agent, batchId: string, body: object) =>
    send(agent, 'post', `${base}/flock-batches/${batchId}/daily-entries`, body);

  async function placeBatch(code: string, purpose = 'LAYER', initialBirds = 1000) {
    const id = (
      await send(owner, 'post', `${base}/flock-batches`, {
        houseId,
        batchCode: code,
        breed: 'Lohmann Brown',
        purpose,
        placementDate: '2026-10-01',
        initialBirds,
      }).expect(201)
    ).body.id;
    await send(owner, 'post', `${base}/flock-batches/${id}/status`, { status: 'ACTIVE' }).expect(
      200,
    );
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const workerUser = await signUp(app, 'worker');
    const auditorUser = await signUp(app, 'auditor');
    worker = workerUser.agent;
    auditor = auditorUser.agent;

    const org = (await send(owner, 'post', '/api/v1/organizations', { name: 'Record Farms' })).body
      .id;
    base = `/api/v1/organizations/${org}`;
    await send(owner, 'post', `${base}/members`, {
      email: workerUser.email,
      role: 'FIELD_WORKER',
    }).expect(201);
    await send(owner, 'post', `${base}/members`, {
      email: auditorUser.email,
      role: 'AUDITOR',
    }).expect(201);

    const farm = (await send(owner, 'post', `${base}/farms`, { name: 'Record Farm' })).body.id;
    houseId = (
      await send(owner, 'post', `${base}/houses`, { farmId: farm, name: 'R1', capacity: 5000 })
    ).body.id;
    feedType = (await send(owner, 'post', `${base}/feed-types`, { name: 'Layer mash' }).expect(201))
      .body.id;
    layers = await placeBatch('REC-LAYERS');
  });

  afterAll(() => app.close());

  describe('feed types', () => {
    it('are unique per organization and configured by managers only', async () => {
      await send(owner, 'post', `${base}/feed-types`, { name: 'Layer mash' }).expect(409);
      await send(worker, 'post', `${base}/feed-types`, { name: 'Grower' }).expect(403);
      const { body } = await worker.get(`${base}/feed-types`).expect(200);
      expect(body.map((f: { name: string }) => f.name)).toEqual(['Layer mash']);
    });
  });

  describe('daily entries', () => {
    it('lets a field worker record a full day in one request', async () => {
      const { body } = await entry(worker, layers, {
        date: '2026-10-01',
        eggsCollected: 0,
        waterLitres: 180.5,
        deaths: [{ quantity: 10, reasonCode: 'HEAT_STRESS' }],
        feed: [{ feedTypeId: feedType, quantityKg: 110 }],
      }).expect(201);

      expect(body.productionLog).toMatchObject({
        eggsCollected: 0,
        waterLitres: 180.5,
        status: 'SUBMITTED',
      });
      expect(body.mortality).toHaveLength(1);
      expect(body.feed[0].quantityKg).toBe(110);
    });

    it('accepts partial entries, such as a midday mortality report', async () => {
      await entry(worker, layers, { date: '2026-10-02', eggsCollected: 900 }).expect(201);
      await entry(worker, layers, {
        date: '2026-10-03',
        deaths: [{ quantity: 40, reasonCode: 'DISEASE' }],
      }).expect(201);
      await entry(worker, layers, { date: '2026-10-03', eggsCollected: 891 }).expect(201);
      await entry(worker, layers, {
        date: '2026-10-04',
        deaths: [{ quantity: 5, reasonCode: 'PREDATOR' }],
        feed: [{ feedTypeId: feedType, quantityKg: 95 }],
        weight: { sampleSize: 50, averageWeightGrams: 1520 },
      }).expect(201);
    });

    it('rejects an empty entry and a second production log for the same day', async () => {
      await entry(worker, layers, { date: '2026-10-05' }).expect(400);
      const { body } = await entry(worker, layers, {
        date: '2026-10-02',
        eggsCollected: 1,
      }).expect(409);
      expect(body.message).toMatch(/already has a production log/);
    });

    it('requires an egg count from laying flocks and caps it at the birds alive', async () => {
      const missing = await entry(worker, layers, { date: '2026-10-05', waterLitres: 100 });
      expect(missing.status).toBe(400);
      expect(missing.body.issues[0].path).toBe('eggsCollected');

      // 1000 placed − 10 − 40 died before Oct 4 = 950 alive at the start of that day.
      const tooMany = await entry(worker, layers, { date: '2026-10-04', eggsCollected: 951 });
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.issues[0].message).toMatch(/950/);
    });

    it('never lets deaths exceed the birds in the batch', async () => {
      const { body } = await entry(worker, layers, {
        date: '2026-10-05',
        deaths: [{ quantity: 946, reasonCode: 'UNKNOWN' }],
      }).expect(400);
      expect(body.issues[0].message).toMatch(/only 945 birds remain/);
    });

    it('keeps entries within the batch’s life', async () => {
      await entry(worker, layers, { date: '2026-09-30', eggsCollected: 0 }).expect(400);
      await entry(worker, layers, { date: '2999-01-01', eggsCollected: 0 }).expect(400);
    });

    it('rejects unknown feed types, including another tenant’s', async () => {
      const { body } = await entry(worker, layers, {
        date: '2026-10-05',
        feed: [{ feedTypeId: '00000000-0000-4000-8000-000000000000', quantityKg: 10 }],
      }).expect(400);
      expect(body.issues[0].path).toBe('feed');
    });

    it('does not accept eggs from broilers', async () => {
      const broilers = await placeBatchInNewHouse('REC-BROILERS', 'BROILER');
      await entry(worker, broilers, { date: '2026-10-02', eggsCollected: 10 }).expect(400);
      await entry(worker, broilers, { date: '2026-10-02', waterLitres: 50 }).expect(201);
    });

    it('refuses records for planned batches and auditors', async () => {
      const planned = (
        await send(owner, 'post', `${base}/flock-batches`, {
          houseId,
          batchCode: 'REC-PLANNED',
          breed: 'Lohmann Brown',
          placementDate: '2026-10-01',
          initialBirds: 10,
        }).expect(201)
      ).body.id;
      await entry(owner, planned, { date: '2026-10-02', eggsCollected: 1 }).expect(409);
      await entry(auditor, layers, { date: '2026-10-05', eggsCollected: 1 }).expect(403);
    });
  });

  describe('production log approval', () => {
    let logId: string;

    beforeAll(async () => {
      const { body } = await owner.get(`${base}/flock-batches/${layers}/records`).expect(200);
      logId = body.productionLogs.find((l: { logDate: string }) =>
        l.logDate.startsWith('2026-10-02'),
      ).id;
    });

    it('lets the recorder fix a submitted log', async () => {
      const { body } = await send(
        worker,
        'patch',
        `${base}/flock-batches/${layers}/production-logs/${logId}`,
        { eggsCollected: 902 },
      ).expect(200);
      expect(body.eggsCollected).toBe(902);
      await send(worker, 'patch', `${base}/flock-batches/${layers}/production-logs/${logId}`, {
        eggsCollected: 900,
      }).expect(200);
    });

    it('only lets supervisors and above approve', async () => {
      await send(
        worker,
        'post',
        `${base}/flock-batches/${layers}/production-logs/${logId}/approve`,
      ).expect(403);
      const { body } = await send(
        owner,
        'post',
        `${base}/flock-batches/${layers}/production-logs/${logId}/approve`,
      ).expect(200);
      expect(body.status).toBe('APPROVED');
      expect(body.approvedBy).not.toBeNull();
    });

    it('locks a log once approved', async () => {
      const { body } = await send(
        worker,
        'patch',
        `${base}/flock-batches/${layers}/production-logs/${logId}`,
        { eggsCollected: 1 },
      ).expect(409);
      expect(body.message).toMatch(/correction/);
      await send(
        owner,
        'post',
        `${base}/flock-batches/${layers}/production-logs/${logId}/approve`,
      ).expect(409);
    });
  });

  describe('reading records', () => {
    it('lists records in a date range with who recorded them', async () => {
      const { body } = await auditor
        .get(`${base}/flock-batches/${layers}/records?from=2026-10-03&to=2026-10-04`)
        .expect(200);
      expect(body.productionLogs).toHaveLength(1);
      expect(body.mortality.map((m: { quantity: number }) => m.quantity)).toEqual([5, 40]);
      expect(body.mortality[0].recorder.name).toBe('worker');
      expect(body.feed[0]).toMatchObject({ quantityKg: 95, feedType: { name: 'Layer mash' } });
      expect(body.weightSamples[0].averageWeightGrams).toBe(1520);
    });

    it('computes daily metrics matching the hand-calculated fixture', async () => {
      const { body } = await owner
        .get(`${base}/flock-batches/${layers}/daily-metrics?from=2026-10-01&to=2026-10-04`)
        .expect(200);
      const byDate = Object.fromEntries(
        body.days.map((d: { date: string }) => [d.date, d]),
      ) as Record<string, Record<string, number | null>>;

      expect(body.days.map((d: { date: string }) => d.date)).toEqual([
        '2026-10-04',
        '2026-10-03',
        '2026-10-02',
        '2026-10-01',
      ]);
      expect(byDate['2026-10-04']).toMatchObject({
        openingBirds: 950,
        closingBirds: 945,
        cumulativeMortalityPct: 5.5,
        averageWeightGrams: 1520,
        eggs: null,
      });
      expect(byDate['2026-10-03']!.henDayPct).toBeCloseTo(90, 10);
      expect(byDate['2026-10-02']!.henDayPct).toBeCloseTo(90.9091, 4);
      expect(byDate['2026-10-01']!.feedPerBirdKg).toBeCloseTo(110 / 995, 10);
      expect(byDate['2026-10-01']!.waterLitres).toBe(180.5);
    });

    it('shows live birds and cumulative mortality on the batch', async () => {
      const { body } = await worker.get(`${base}/flock-batches/${layers}`).expect(200);
      expect(body).toMatchObject({ liveBirds: 945, cumulativeMortalityPct: 5.5 });
    });

    it('limits the metrics window to a year', async () => {
      await owner
        .get(`${base}/flock-batches/${layers}/daily-metrics?from=2025-01-01&to=2026-10-04`)
        .expect(400);
    });
  });

  describe('after depletion', () => {
    it('accepts late entries up to the end date, then nothing once closed', async () => {
      await send(owner, 'post', `${base}/flock-batches/${layers}/status`, {
        status: 'DEPLETED',
        date: '2026-10-10',
      }).expect(200);
      await entry(worker, layers, { date: '2026-10-09', eggsCollected: 800 }).expect(201);
      await entry(worker, layers, { date: '2026-10-11', eggsCollected: 800 }).expect(400);

      await send(owner, 'post', `${base}/flock-batches/${layers}/status`, {
        status: 'CLOSED',
      }).expect(200);
      await entry(worker, layers, { date: '2026-10-09', waterLitres: 1, eggsCollected: 1 }).expect(
        409,
      );
    });

    it('audits every entry and approval', async () => {
      const { body } = await owner.get(`${base}/audit-logs?limit=100`).expect(200);
      const actions = body.items.map((e: { action: string }) => e.action);
      expect(actions).toContain('daily_entry.recorded');
      expect(actions).toContain('production_log.updated');
      expect(actions).toContain('production_log.approved');
      expect(actions).toContain('feed_type.created');
    });
  });

  async function placeBatchInNewHouse(code: string, purpose: string) {
    const farm = (await send(owner, 'post', `${base}/farms`, { name: `Farm ${code}` })).body.id;
    houseId = (
      await send(owner, 'post', `${base}/houses`, { farmId: farm, name: 'B1', capacity: 5000 })
    ).body.id;
    return placeBatch(code, purpose, 500);
  }
});
