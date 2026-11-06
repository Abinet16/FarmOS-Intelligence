import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { WEB_ORIGIN } from './support/test-env.js';

type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

/**
 * Farms, houses and flock batches through the HTTP API: the structure every
 * operational record hangs off, and the rules that keep it consistent.
 */
describe('farm structure', () => {
  let app: INestApplication;
  let owner: Agent;
  let worker: Agent;
  let outsider: Agent;
  let org: string;
  let base: string;

  const send = (agent: Agent, method: 'post' | 'patch', url: string, body: object) =>
    agent[method](url).set('Origin', WEB_ORIGIN).send(body);

  const createFarm = (name: string, location?: string) =>
    send(owner, 'post', `${base}/farms`, { name, location }).expect(201);
  const createHouse = (farmId: string, name: string, capacity = 5000) =>
    send(owner, 'post', `${base}/houses`, { farmId, name, capacity }).expect(201);
  const createBatch = (houseId: string, batchCode: string, initialBirds = 4800) =>
    send(owner, 'post', `${base}/flock-batches`, {
      houseId,
      batchCode,
      breed: 'Lohmann Brown',
      placementDate: '2026-10-01',
      initialBirds,
    });
  const setStatus = (batchId: string, status: string, date?: string) =>
    send(owner, 'post', `${base}/flock-batches/${batchId}/status`, { status, date });

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const { agent, email } = await signUp(app, 'worker');
    worker = agent;
    ({ agent: outsider } = await signUp(app, 'outsider'));

    org = (
      await send(owner, 'post', '/api/v1/organizations', { name: 'Structure Farms' }).expect(201)
    ).body.id;
    base = `/api/v1/organizations/${org}`;
    await send(owner, 'post', `${base}/members`, { email, role: 'FIELD_WORKER' }).expect(201);
  });

  afterAll(() => app.close());

  describe('farms', () => {
    beforeAll(async () => {
      await createFarm('Alpha Ridge', 'Bishoftu');
      await createFarm('Beta Valley', 'Adama');
      await createFarm('Gamma Hills', 'Bishoftu East');
    });

    it('lists farms by name with a total for paging', async () => {
      const { body } = await owner.get(`${base}/farms?pageSize=2`).expect(200);
      expect(body.total).toBe(3);
      expect(body.items.map((f: { name: string }) => f.name)).toEqual([
        'Alpha Ridge',
        'Beta Valley',
      ]);

      const { body: second } = await owner.get(`${base}/farms?pageSize=2&page=2`).expect(200);
      expect(second.items.map((f: { name: string }) => f.name)).toEqual(['Gamma Hills']);
    });

    it('searches name and location case-insensitively', async () => {
      const { body } = await owner.get(`${base}/farms?q=bishoftu`).expect(200);
      expect(body.items.map((f: { name: string }) => f.name)).toEqual([
        'Alpha Ridge',
        'Gamma Hills',
      ]);
    });

    it('rejects a duplicate farm name in the same organization', async () => {
      await send(owner, 'post', `${base}/farms`, { name: 'Alpha Ridge' }).expect(409);
    });

    it('lets a field worker read but not configure farms', async () => {
      await worker.get(`${base}/farms`).expect(200);
      await send(worker, 'post', `${base}/farms`, { name: 'Worker Farm' }).expect(403);
    });

    it('hides farms from non-members', async () => {
      await outsider.get(`${base}/farms`).expect(404);
    });

    it('updates a farm and clears its location', async () => {
      const farm = (await createFarm('Delta Plains', 'Mojo')).body;
      const { body } = await send(owner, 'patch', `${base}/farms/${farm.id}`, {
        location: null,
      }).expect(200);
      expect(body.location).toBeNull();
    });
  });

  describe('houses', () => {
    let farmId: string;

    beforeAll(async () => {
      farmId = (await createFarm('House Farm')).body.id;
    });

    it('creates houses under a farm and counts them on the farm', async () => {
      const { body } = await createHouse(farmId, 'H1', 6000);
      expect(body).toMatchObject({ name: 'H1', capacity: 6000, farm: { id: farmId } });
      await createHouse(farmId, 'H2');

      const { body: farm } = await owner.get(`${base}/farms/${farmId}`).expect(200);
      expect(farm.houseCount).toBe(2);

      const { body: houses } = await owner.get(`${base}/houses?farmId=${farmId}`).expect(200);
      expect(houses.items.map((h: { name: string }) => h.name)).toEqual(['H1', 'H2']);
    });

    it('validates capacity', async () => {
      const { body } = await send(owner, 'post', `${base}/houses`, {
        farmId,
        name: 'H0',
        capacity: 0,
      }).expect(400);
      expect(body.issues[0].path).toBe('capacity');
    });

    it('will not attach a house to another tenant’s farm', async () => {
      const otherOrg = (
        await send(outsider, 'post', '/api/v1/organizations', { name: 'Other Org' }).expect(201)
      ).body.id;
      const otherFarm = (
        await send(outsider, 'post', `/api/v1/organizations/${otherOrg}/farms`, {
          name: 'Theirs',
        }).expect(201)
      ).body.id;

      await send(owner, 'post', `${base}/houses`, {
        farmId: otherFarm,
        name: 'Smuggled',
        capacity: 10,
      }).expect(404);
    });
  });

  describe('flock batches', () => {
    let farmId: string;
    let houseId: string;
    let batchId: string;

    beforeAll(async () => {
      farmId = (await createFarm('Flock Farm')).body.id;
      houseId = (await createHouse(farmId, 'F1', 5000)).body.id;
    });

    it('creates a planned batch', async () => {
      const { body } = await createBatch(houseId, 'FF-2026-01').expect(201);
      expect(body).toMatchObject({
        status: 'PLANNED',
        purpose: 'LAYER',
        endDate: null,
        ageDays: null,
        house: { id: houseId, farm: { id: farmId } },
      });
      batchId = body.id;
    });

    it('refuses more birds than the house holds', async () => {
      const { body } = await createBatch(houseId, 'FF-TOO-BIG', 5001).expect(400);
      expect(body.issues[0]).toMatchObject({ path: 'initialBirds' });
    });

    it('rejects a duplicate batch code and an impossible date', async () => {
      await createBatch(houseId, 'FF-2026-01').expect(409);
      await send(owner, 'post', `${base}/flock-batches`, {
        houseId,
        batchCode: 'FF-BAD-DATE',
        breed: 'Lohmann Brown',
        placementDate: '2026-02-30',
        initialBirds: 10,
      }).expect(400);
    });

    it('places a batch and reports its age', async () => {
      const { body } = await setStatus(batchId, 'ACTIVE').expect(200);
      expect(body.status).toBe('ACTIVE');
      expect(body.ageDays).toBeGreaterThan(0);

      const { body: house } = await owner.get(`${base}/houses/${houseId}`).expect(200);
      expect(house.activeBatch).toMatchObject({ id: batchId, batchCode: 'FF-2026-01' });
    });

    it('allows only one active batch per house', async () => {
      const second = (await createBatch(houseId, 'FF-2026-02', 100).expect(201)).body.id;
      const { body } = await setStatus(second, 'ACTIVE').expect(409);
      expect(body.message).toMatch(/FF-2026-01/);
    });

    it('locks placement details once the birds are placed', async () => {
      await send(owner, 'patch', `${base}/flock-batches/${batchId}`, {
        initialBirds: 4000,
      }).expect(409);
      const { body } = await send(owner, 'patch', `${base}/flock-batches/${batchId}`, {
        breed: 'ISA Brown',
      }).expect(200);
      expect(body.breed).toBe('ISA Brown');
    });

    it('keeps house capacity above the birds placed in it', async () => {
      await send(owner, 'patch', `${base}/houses/${houseId}`, { capacity: 1000 }).expect(409);
    });

    it('rejects transitions the lifecycle does not allow', async () => {
      await setStatus(batchId, 'PLANNED').expect(409);
      await setStatus(batchId, 'CLOSED').expect(409);
    });

    it('depletes on a past date, never a future one', async () => {
      const { body: future } = await setStatus(batchId, 'DEPLETED', '2999-01-01').expect(400);
      expect(future.issues[0].path).toBe('date');
      await setStatus(batchId, 'DEPLETED', '2026-09-01').expect(400);

      const { body } = await setStatus(batchId, 'DEPLETED', '2026-11-01').expect(200);
      expect(body).toMatchObject({ status: 'DEPLETED', endDate: '2026-11-01T00:00:00.000Z' });
      expect(body.ageDays).toBe(31);
    });

    it('closes a depleted batch and makes it read-only', async () => {
      const { body } = await setStatus(batchId, 'CLOSED').expect(200);
      expect(body.endDate).toBe('2026-11-01T00:00:00.000Z');
      await send(owner, 'patch', `${base}/flock-batches/${batchId}`, { notes: 'late' }).expect(409);
    });

    it('filters batches by status and searches by code or breed', async () => {
      const { body: closed } = await owner
        .get(`${base}/flock-batches?status=CLOSED&farmId=${farmId}`)
        .expect(200);
      expect(closed.items.map((b: { batchCode: string }) => b.batchCode)).toEqual(['FF-2026-01']);

      const { body: byBreed } = await owner.get(`${base}/flock-batches?q=isa`).expect(200);
      expect(byBreed.total).toBe(1);
    });

    it('lets a field worker read batches but not change them', async () => {
      await worker.get(`${base}/flock-batches/${batchId}`).expect(200);
      await createBatch(houseId, 'FF-WORKER').expect(201); // sanity: owner can
      await send(worker, 'post', `${base}/flock-batches`, {
        houseId,
        batchCode: 'FF-WORKER-2',
        breed: 'Lohmann Brown',
        placementDate: '2026-10-01',
        initialBirds: 10,
      }).expect(403);
    });
  });

  describe('archiving', () => {
    let farmId: string;
    let houseId: string;
    let batchId: string;

    beforeAll(async () => {
      farmId = (await createFarm('Archive Farm')).body.id;
      houseId = (await createHouse(farmId, 'A1')).body.id;
      await createHouse(farmId, 'A2');
      batchId = (await createBatch(houseId, 'AR-01', 100).expect(201)).body.id;
    });

    it('refuses to archive a farm or house with an open flock', async () => {
      await send(owner, 'post', `${base}/farms/${farmId}/archive`, {}).expect(409);
      await send(owner, 'post', `${base}/houses/${houseId}/archive`, {}).expect(409);
    });

    it('archives a farm together with its houses, and hides them from lists', async () => {
      const { body: cancelled } = await setStatus(batchId, 'CLOSED').expect(200);
      expect(cancelled.endDate).toBe(cancelled.placementDate);

      const { body } = await send(owner, 'post', `${base}/farms/${farmId}/archive`, {}).expect(200);
      expect(body.archivedAt).not.toBeNull();

      const { body: farms } = await owner.get(`${base}/farms?q=archive`).expect(200);
      expect(farms.total).toBe(0);
      const { body: all } = await owner
        .get(`${base}/farms?q=archive&includeArchived=true`)
        .expect(200);
      expect(all.total).toBe(1);

      const { body: houses } = await owner.get(`${base}/houses?farmId=${farmId}`).expect(200);
      expect(houses.total).toBe(0);
    });

    it('blocks new houses and flocks in an archived farm', async () => {
      await send(owner, 'post', `${base}/houses`, { farmId, name: 'A3', capacity: 10 }).expect(409);
      await createBatch(houseId, 'AR-02', 10).expect(409);
      await send(owner, 'post', `${base}/houses/${houseId}/restore`, {}).expect(409);
    });

    it('restores the farm with the houses it archived', async () => {
      await send(owner, 'post', `${base}/farms/${farmId}/restore`, {}).expect(200);
      const { body: houses } = await owner.get(`${base}/houses?farmId=${farmId}`).expect(200);
      expect(houses.total).toBe(2);
    });

    it('records every change in the audit log', async () => {
      const { body } = await owner.get(`${base}/audit-logs?limit=100`).expect(200);
      const actions = new Set(body.items.map((e: { action: string }) => e.action));
      for (const action of [
        'farm.created',
        'farm.updated',
        'farm.archived',
        'farm.restored',
        'house.created',
        'flock_batch.created',
        'flock_batch.updated',
        'flock_batch.status_changed',
      ]) {
        expect(actions).toContain(action);
      }
    });
  });
});
