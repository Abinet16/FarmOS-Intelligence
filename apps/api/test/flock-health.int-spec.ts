import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';

/** Vaccine list, vaccination schedules and outcomes, and health observations. */
describe('flock health', () => {
  let app: INestApplication;
  let owner: Agent;
  let vet: Agent;
  let worker: Agent;
  let base: string;
  let batchId: string;
  let newcastle: string;

  const batchUrl = () => `${base}/flock-batches/${batchId}`;

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const v = await signUp(app, 'vet');
    const w = await signUp(app, 'worker');
    vet = v.agent;
    worker = w.agent;
    ({ base, batchId } = await createFarmWithFlock(owner, 'Health Farms'));
    await addMember(owner, base, v.email, 'VETERINARIAN');
    await addMember(owner, base, w.email, 'FIELD_WORKER');
  });

  afterAll(() => app.close());

  describe('vaccines', () => {
    it('are managed by people with health:record', async () => {
      const { body } = await send(vet, 'post', `${base}/vaccines`, {
        name: 'Newcastle (La Sota)',
        recommendedIntervalDays: 21,
      }).expect(201);
      newcastle = body.id;
      await send(worker, 'post', `${base}/vaccines`, { name: 'Gumboro' }).expect(403);
      await send(vet, 'post', `${base}/vaccines`, { name: 'Newcastle (La Sota)' }).expect(409);

      const { body: list } = await worker.get(`${base}/vaccines`).expect(200);
      expect(list).toHaveLength(1);
    });
  });

  describe('vaccinations', () => {
    let vaccinationId: string;

    it('schedules a vaccination within the flock’s life', async () => {
      await send(vet, 'post', `${batchUrl()}/vaccinations`, {
        vaccineId: newcastle,
        scheduledDate: '2026-09-01',
      }).expect(400);
      const { body } = await send(vet, 'post', `${batchUrl()}/vaccinations`, {
        vaccineId: newcastle,
        scheduledDate: '2026-10-07',
      }).expect(201);
      expect(body).toMatchObject({ status: 'SCHEDULED', vaccine: { name: 'Newcastle (La Sota)' } });
      vaccinationId = body.id;
    });

    it('lists due and overdue vaccinations across the organization', async () => {
      const { body } = await worker.get(`${base}/vaccinations?dueWithinDays=7`).expect(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ id: vaccinationId, overdue: true });
    });

    it('records administration and schedules the booster', async () => {
      const { body } = await send(
        vet,
        'post',
        `${batchUrl()}/vaccinations/${vaccinationId}/outcome`,
        { status: 'ADMINISTERED', administeredAt: '2026-10-07T08:30:00+03:00', scheduleNext: true },
      ).expect(200);
      expect(body.vaccination).toMatchObject({ status: 'ADMINISTERED', recorder: { name: 'vet' } });
      expect(body.next).toMatchObject({
        status: 'SCHEDULED',
        scheduledDate: '2026-10-28T00:00:00.000Z',
      });
    });

    it('treats every outcome as final', async () => {
      await send(vet, 'post', `${batchUrl()}/vaccinations/${vaccinationId}/outcome`, {
        status: 'MISSED',
      }).expect(409);
    });

    it('rejects future administration times and field workers', async () => {
      const { body: scheduled } = await send(vet, 'post', `${batchUrl()}/vaccinations`, {
        vaccineId: newcastle,
        scheduledDate: '2026-10-20',
      }).expect(201);
      const url = `${batchUrl()}/vaccinations/${scheduled.id}/outcome`;
      await send(vet, 'post', url, {
        status: 'ADMINISTERED',
        administeredAt: '2999-01-01T00:00:00Z',
      }).expect(400);
      await send(worker, 'post', url, { status: 'MISSED' }).expect(403);
      const { body } = await send(vet, 'post', url, { status: 'MISSED' }).expect(200);
      expect(body.vaccination.status).toBe('MISSED');
      expect(body.next).toBeNull();
    });
  });

  describe('health events', () => {
    let eventId: string;

    it('records an observation, not a diagnosis', async () => {
      const { body } = await send(vet, 'post', `${batchUrl()}/health-events`, {
        observedAt: '2026-10-05T07:00:00Z',
        category: 'RESPIRATORY',
        severity: 'MEDIUM',
        description: 'Sneezing in the north end of the house; about 20 birds.',
      }).expect(201);
      expect(body).toMatchObject({ resolutionStatus: 'OPEN', recorder: { name: 'vet' } });
      eventId = body.id;

      await send(vet, 'post', `${batchUrl()}/health-events`, {
        category: 'DIAGNOSIS_NEWCASTLE',
        severity: 'HIGH',
        description: 'not a category',
      }).expect(400);
    });

    it('tracks resolution', async () => {
      const url = `${batchUrl()}/health-events/${eventId}`;
      await send(vet, 'patch', url, { resolutionStatus: 'MONITORING' }).expect(200);
      const { body } = await send(vet, 'patch', url, { resolutionStatus: 'RESOLVED' }).expect(200);
      expect(body.resolutionStatus).toBe('RESOLVED');
    });

    it('lists open issues across the organization', async () => {
      await send(owner, 'post', `${batchUrl()}/health-events`, {
        category: 'LEG_AND_MOBILITY',
        severity: 'LOW',
        description: 'A few birds limping.',
      }).expect(201);
      const { body } = await worker.get(`${base}/health-events?resolutionStatus=OPEN`).expect(200);
      expect(body.items.map((e: { category: string }) => e.category)).toEqual(['LEG_AND_MOBILITY']);
    });

    it('audits health activity', async () => {
      const { body } = await owner.get(`${base}/audit-logs?limit=100`).expect(200);
      const actions = body.items.map((e: { action: string }) => e.action);
      for (const action of [
        'vaccine.created',
        'vaccination.scheduled',
        'vaccination.administered',
        'vaccination.missed',
        'health_event.recorded',
        'health_event.status_changed',
      ]) {
        expect(actions).toContain(action);
      }
    });
  });
});
