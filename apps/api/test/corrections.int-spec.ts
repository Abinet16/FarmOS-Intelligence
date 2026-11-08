import type { INestApplication } from '@nestjs/common';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';

/**
 * Fixing records without silent edits: corrections to approved production
 * logs (requested, reviewed by someone else, applied on approval) and voiding
 * of mortality, feed and weight records.
 */
describe('corrections and voids', () => {
  let app: INestApplication;
  let owner: Agent;
  let supervisor: Agent;
  let worker: Agent;
  let base: string;
  let batchId: string;
  let logId: string;

  const batchUrl = () => `${base}/flock-batches/${batchId}`;

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: owner } = await signUp(app, 'owner'));
    const sup = await signUp(app, 'supervisor');
    const wrk = await signUp(app, 'worker');
    supervisor = sup.agent;
    worker = wrk.agent;
    ({ base, batchId } = await createFarmWithFlock(owner, 'Correction Farms'));
    await addMember(owner, base, sup.email, 'SUPERVISOR');
    await addMember(owner, base, wrk.email, 'FIELD_WORKER');

    const { body } = await send(worker, 'post', `${batchUrl()}/daily-entries`, {
      date: '2026-10-02',
      eggsCollected: 900,
      waterLitres: 200,
      deaths: [{ quantity: 30, reasonCode: 'UNKNOWN' }],
    }).expect(201);
    logId = body.productionLog.id;
  });

  afterAll(() => app.close());

  describe('production log corrections', () => {
    it('are only for approved logs; submitted ones are edited directly', async () => {
      await send(worker, 'post', `${batchUrl()}/production-logs/${logId}/corrections`, {
        changes: { eggsCollected: 910 },
        reason: 'Recount',
      }).expect(409);
      await send(supervisor, 'post', `${batchUrl()}/production-logs/${logId}/approve`).expect(200);
    });

    it('reject a request that changes nothing or breaks the egg rule', async () => {
      const url = `${batchUrl()}/production-logs/${logId}/corrections`;
      await send(worker, 'post', url, { changes: { eggsCollected: 900 }, reason: 'Same' }).expect(
        400,
      );
      await send(worker, 'post', url, { changes: { eggsCollected: 1001 }, reason: 'Typo' }).expect(
        400,
      );
    });

    let correctionId: string;

    it('lets the field team request a correction with a reason', async () => {
      const { body } = await send(
        worker,
        'post',
        `${batchUrl()}/production-logs/${logId}/corrections`,
        { changes: { eggsCollected: 940, waterLitres: 200 }, reason: 'Second tray missed' },
      ).expect(201);
      // Unchanged values are dropped from the proposal.
      expect(body.proposedChanges).toEqual({ eggsCollected: 940 });
      expect(body.status).toBe('PENDING');
      correctionId = body.id;
    });

    it('allows one pending correction per log', async () => {
      await send(worker, 'post', `${batchUrl()}/production-logs/${logId}/corrections`, {
        changes: { eggsCollected: 950 },
        reason: 'Another',
      }).expect(409);
    });

    it('shows pending corrections to reviewers only', async () => {
      await worker.get(`${base}/corrections`).expect(403);
      const { body } = await supervisor.get(`${base}/corrections?status=PENDING`).expect(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        reason: 'Second tray missed',
        productionLog: { eggsCollected: 900, waterLitres: 200 },
      });
    });

    it('applies the change on approval and audits before and after', async () => {
      const { body } = await send(owner, 'post', `${base}/corrections/${correctionId}/approve`, {
        note: 'Checked the tray sheet',
      }).expect(200);
      expect(body).toMatchObject({ status: 'APPROVED', reviewNote: 'Checked the tray sheet' });

      const { body: records } = await owner.get(`${batchUrl()}/records`).expect(200);
      expect(records.productionLogs[0]).toMatchObject({ eggsCollected: 940, status: 'APPROVED' });

      const { body: audit } = await owner.get(`${base}/audit-logs?limit=5`).expect(200);
      const corrected = audit.items.find(
        (e: { action: string }) => e.action === 'production_log.corrected',
      );
      expect(corrected.metadata).toMatchObject({
        before: { eggsCollected: 900 },
        after: { eggsCollected: 940 },
      });
    });

    it('is reviewed once', async () => {
      await send(owner, 'post', `${base}/corrections/${correctionId}/reject`, {
        note: 'late',
      }).expect(409);
    });

    it('enforces review by someone else, and requires a note to reject', async () => {
      const { body } = await send(
        supervisor,
        'post',
        `${batchUrl()}/production-logs/${logId}/corrections`,
        { changes: { notes: 'Fan failure' }, reason: 'Add context' },
      ).expect(201);
      const { body: denied } = await send(
        supervisor,
        'post',
        `${base}/corrections/${body.id}/approve`,
      ).expect(403);
      expect(denied.message).toMatch(/someone other than/);

      await send(owner, 'post', `${base}/corrections/${body.id}/reject`).expect(400);
      const { body: rejected } = await send(
        owner,
        'post',
        `${base}/corrections/${body.id}/reject`,
        {
          note: 'Put it in the health log',
        },
      ).expect(200);
      expect(rejected.status).toBe('REJECTED');
    });
  });

  describe('voiding records', () => {
    let mortalityId: string;

    beforeAll(async () => {
      const { body } = await owner.get(`${batchUrl()}/records`).expect(200);
      mortalityId = body.mortality[0].id;
    });

    it('needs a reviewer and a reason', async () => {
      await send(worker, 'post', `${batchUrl()}/mortality/${mortalityId}/void`, {
        reason: 'Wrong flock',
      }).expect(403);
      await send(supervisor, 'post', `${batchUrl()}/mortality/${mortalityId}/void`).expect(400);
      await send(supervisor, 'post', `${batchUrl()}/unknown/${mortalityId}/void`, {
        reason: 'x'.repeat(5),
      }).expect(400);
    });

    it('keeps the record but removes it from every total', async () => {
      const before = await owner.get(batchUrl()).expect(200);
      expect(before.body.liveBirds).toBe(970);

      const { body } = await send(
        supervisor,
        'post',
        `${batchUrl()}/mortality/${mortalityId}/void`,
        { reason: 'Recorded against the wrong flock' },
      ).expect(200);
      expect(body.voidReason).toBe('Recorded against the wrong flock');

      const after = await owner.get(batchUrl()).expect(200);
      expect(after.body).toMatchObject({ liveBirds: 1000, cumulativeMortalityPct: 0 });

      const { body: metrics } = await owner
        .get(`${batchUrl()}/daily-metrics?from=2026-10-02&to=2026-10-02`)
        .expect(200);
      expect(metrics.days[0].deaths).toBe(0);

      const { body: records } = await owner.get(`${batchUrl()}/records`).expect(200);
      expect(records.mortality[0]).toMatchObject({
        id: mortalityId,
        voider: { name: 'supervisor' },
      });
    });

    it('frees the voided birds for new entries, and voids only once', async () => {
      await send(worker, 'post', `${batchUrl()}/daily-entries`, {
        date: '2026-10-03',
        deaths: [{ quantity: 1000, reasonCode: 'CULLED' }],
      }).expect(201);
      await send(supervisor, 'post', `${batchUrl()}/mortality/${mortalityId}/void`, {
        reason: 'again',
      }).expect(409);
    });

    it('voids feed and weight records too', async () => {
      const { body: feedType } = await send(owner, 'post', `${base}/feed-types`, {
        name: 'Starter',
      }).expect(201);
      const { body: entry } = await send(worker, 'post', `${batchUrl()}/daily-entries`, {
        date: '2026-10-02',
        feed: [{ feedTypeId: feedType.id, quantityKg: 100 }],
        weight: { sampleSize: 10, averageWeightGrams: 400 },
      }).expect(201);

      await send(supervisor, 'post', `${batchUrl()}/feed-usage/${entry.feed[0].id}/void`, {
        reason: 'Double entry',
      }).expect(200);
      await send(supervisor, 'post', `${batchUrl()}/weight-samples/${entry.weight.id}/void`, {
        reason: 'Scale not tared',
      }).expect(200);

      const { body: metrics } = await owner
        .get(`${batchUrl()}/daily-metrics?from=2026-10-02&to=2026-10-02`)
        .expect(200);
      expect(metrics.days[0]).toMatchObject({ feedKg: null, averageWeightGrams: null });
    });
  });
});
