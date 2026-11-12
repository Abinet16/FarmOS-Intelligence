import type { INestApplication } from '@nestjs/common';
import { JOB_QUEUE } from '../src/jobs/jobs.js';
import { FILE_STORE, LocalFileStore } from '../src/storage/file-store.js';
import { ReportsService } from '../src/modules/reports/reports.service.js';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';
import { RecordingJobQueue, runJobs } from './support/jobs.js';

const DAY_MS = 86_400_000;
const BOM = String.fromCharCode(0xfeff);

/** CSV rows as arrays of cells (no quoted commas in this fixture's data). */
function rows(csv: string) {
  return csv
    .replace(BOM, '')
    .trimEnd()
    .split('\r\n')
    .map((line) => line.split(','));
}

/**
 * Report jobs and direct exports over one flock: 1,000 layers with a week of
 * records (2 deaths, 900 eggs and 110 kg of feed a day, 1–7 Oct), one entry
 * by a field worker on 8 Oct, and a death note that looks like a formula.
 */
describe('reports', () => {
  let app: INestApplication;
  let queue: RecordingJobQueue;
  let owner: Agent;
  let worker: Agent;
  let manager: Agent;
  let rival: Agent;
  let base: string;
  let rivalBase: string;
  let farmId: string;
  let batchId: string;
  let workerMembership: string;

  const request = (agent: Agent, body: object) => send(agent, 'post', `${base}/reports`, body);
  const download = (agent: Agent, id: string) =>
    agent
      .get(`${base}/reports/${id}/download`)
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
        res.on('end', () => done(null, text));
      });

  beforeAll(async () => {
    app = await createTestApp();
    queue = app.get(JOB_QUEUE);
    ({ agent: owner } = await signUp(app, 'owner'));
    const w = await signUp(app, 'worker');
    const m = await signUp(app, 'manager');
    worker = w.agent;
    manager = m.agent;
    ({ agent: rival } = await signUp(app, 'rival'));
    ({ base, farmId, batchId } = await createFarmWithFlock(owner, 'Report Farms'));
    ({ base: rivalBase } = await createFarmWithFlock(rival, 'Rival Farms'));
    workerMembership = await addMember(owner, base, w.email, 'FIELD_WORKER');
    await addMember(owner, base, m.email, 'MANAGER');

    const feedTypeId = (await send(owner, 'post', `${base}/feed-types`, { name: 'Mash' })).body.id;
    for (let day = 1; day <= 7; day++) {
      await send(owner, 'post', `${base}/flock-batches/${batchId}/daily-entries`, {
        date: `2026-10-0${day}`,
        eggsCollected: 900,
        deaths: [
          {
            quantity: 2,
            reasonCode: 'UNKNOWN',
            ...(day === 3 && { notes: '=HYPERLINK("http://evil.example","click")' }),
          },
        ],
        feed: [{ feedTypeId, quantityKg: 110 }],
      }).expect(201);
    }
    await send(worker, 'post', `${base}/flock-batches/${batchId}/daily-entries`, {
      date: '2026-10-08',
      eggsCollected: 850,
    }).expect(201);
  });

  afterAll(() => app.close());

  describe('catalog', () => {
    it('lists the reports each role may run', async () => {
      const types = async (agent: Agent) =>
        ((await agent.get(`${base}/reports/types`).expect(200)).body as { type: string }[]).map(
          (t) => t.type,
        );
      expect(await types(owner)).toEqual([
        'flock_performance',
        'daily_production',
        'mortality',
        'health_events',
        'vaccinations',
        'inventory_stock',
        'alerts',
        'my_entries',
      ]);
      expect(await types(worker)).toEqual(['my_entries']);
    });
  });

  describe('report jobs', () => {
    it('queues a report, generates it in the worker and serves the file', async () => {
      const { body: job } = await request(owner, {
        type: 'flock_performance',
        parameters: { from: '2026-10-01', to: '2026-10-07' },
      }).expect(202);
      expect(job).toMatchObject({
        reportType: 'flock_performance',
        status: 'QUEUED',
        created: true,
        downloadable: false,
        parameters: { from: '2026-10-01', to: '2026-10-07' },
      });
      expect(queue.jobs).toContainEqual({
        name: 'reports.generate',
        data: { organizationId: expect.any(String), reportJobId: job.id },
        options: { jobId: `report-${job.id}` },
      });

      expect(await runJobs(app, 'reports.generate')).toEqual(['succeeded']);

      const { body: done } = await owner.get(`${base}/reports/${job.id}`).expect(200);
      expect(done).toMatchObject({
        status: 'SUCCEEDED',
        rowCount: 1,
        attempts: 1,
        downloadable: true,
      });
      expect(new Date(done.expiresAt).getTime() - new Date(done.completedAt).getTime()).toBe(
        7 * DAY_MS,
      );

      const file = await download(owner, job.id).expect(200);
      expect(file.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(file.headers['content-disposition']).toBe(
        'attachment; filename="flock_performance_2026-10-01_2026-10-07.csv"',
      );
      expect(file.headers['cache-control']).toBe('no-store');
      const [header, row] = rows(file.body as string);
      const cell = (name: string) => row![header!.indexOf(name)];
      expect(cell('Flock')).toBe('REP-01');
      expect(cell('Starting birds')).toBe('1000');
      expect(cell('Deaths')).toBe('14');
      expect(cell('Mortality %')).toBe('1.40');
      expect(cell('Eggs')).toBe('6300');
      expect(cell('Feed kg')).toBe('770.0');
    });

    it('tells the requester the report is ready and audits each step', async () => {
      const { body } = await owner.get(`${base}/notifications`).expect(200);
      expect(body.items[0]).toMatchObject({
        kind: 'report.ready',
        title: 'Flock performance report is ready',
        link: expect.stringMatching(/^\/reports\?job=/),
      });
      const audit = (await owner.get(`${base}/audit-logs?limit=50`).expect(200)).body.items as {
        action: string;
        actor: unknown;
      }[];
      const actions = audit.map((entry) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining(['report.requested', 'report.generated', 'report.downloaded']),
      );
      // Generation is done by the worker, recorded as the system.
      expect(audit.find((entry) => entry.action === 'report.generated')?.actor).toBeNull();
    });

    it('returns the same job for a retried request', async () => {
      const body = { type: 'mortality', idempotencyKey: 'retry-key-0001' };
      const first = (await request(owner, body).expect(202)).body;
      const second = (await request(owner, body).expect(202)).body;
      expect(second).toMatchObject({ id: first.id, created: false });
      expect(queue.take('reports.generate')).toHaveLength(1);
      await request(owner, { ...body, type: 'alerts' }).expect(409);
      await request(manager, body).expect(409);
    });

    it('keeps report jobs private to the member who asked', async () => {
      const { body: job } = await request(owner, { type: 'inventory_stock' }).expect(202);
      await runJobs(app, 'reports.generate');
      await manager.get(`${base}/reports/${job.id}`).expect(404);
      await download(manager, job.id).expect(404);
      expect((await manager.get(`${base}/reports`).expect(200)).body.total).toBe(0);
      // Not a member: the organization itself is hidden.
      await rival.get(`${base}/reports/${job.id}`).expect(404);
      await rival.get(`${rivalBase}/reports/${job.id}`).expect(404);
    });

    it('limits field workers to their own entries', async () => {
      await request(worker, { type: 'flock_performance' }).expect(403);
      const { body: job } = await request(worker, {
        type: 'my_entries',
        parameters: { from: '2026-10-01', to: '2026-10-31' },
      }).expect(202);
      await runJobs(app, 'reports.generate');
      const [header, ...entries] = rows((await download(worker, job.id).expect(200)).body);
      expect(header).toEqual([
        'Date',
        'Record',
        'Flock',
        'Quantity',
        'Unit',
        'Details',
        'Status',
        'Entered at',
      ]);
      // Only the worker's own 8 Oct egg count, none of the owner's week.
      expect(entries.map((entry) => entry.slice(0, 4))).toEqual([
        ['2026-10-08', 'Eggs', 'REP-01', '850'],
      ]);
    });

    it('rejects parameters that do not fit the report', async () => {
      await request(owner, { type: 'inventory_stock', parameters: { batchId } }).expect(400);
      await request(owner, {
        type: 'inventory_stock',
        parameters: { from: '2026-10-01', to: '2026-10-02' },
      }).expect(400);
      await request(owner, {
        type: 'my_entries',
        parameters: { from: '2026-09-01', to: '2026-10-31' },
      }).expect(400);
      await request(owner, {
        type: 'flock_performance',
        parameters: { farmId: '00000000-0000-4000-8000-000000000000' },
      }).expect(400);
      await request(owner, { type: 'flock_performance', organizationId: 'x' }).expect(400);
    });

    it('fails a job whose requester lost access before it ran', async () => {
      await send(owner, 'patch', `${base}/members/${workerMembership}`, {
        role: 'SUPERVISOR',
      }).expect(200);
      const { body: job } = await request(worker, { type: 'mortality' }).expect(202);
      await send(owner, 'patch', `${base}/members/${workerMembership}`, {
        role: 'FIELD_WORKER',
      }).expect(200);

      expect(await runJobs(app, 'reports.generate')).toEqual(['revoked']);
      const { body } = await worker.get(`${base}/reports/${job.id}`).expect(200);
      expect(body).toMatchObject({
        status: 'FAILED',
        error: 'You no longer have access to this report.',
      });
      const inbox = (await worker.get(`${base}/notifications`).expect(200)).body.items;
      expect(inbox[0]).toMatchObject({ kind: 'report.failed' });
    });

    it('retries a failed attempt and records the failure after the last one', async () => {
      const files = app.get<LocalFileStore>(FILE_STORE);
      const write = vi.spyOn(files, 'write').mockRejectedValue(new Error('disk full'));
      const { body: job } = await request(owner, { type: 'alerts' }).expect(202);
      const [recorded] = queue.take('reports.generate');
      const reports = app.get(ReportsService);

      await expect(reports.generate(recorded!.data.organizationId, job.id, false)).rejects.toThrow(
        'disk full',
      );
      expect((await owner.get(`${base}/reports/${job.id}`)).body).toMatchObject({
        status: 'RUNNING',
        attempts: 1,
      });
      await expect(reports.generate(recorded!.data.organizationId, job.id, true)).rejects.toThrow(
        'disk full',
      );
      expect((await owner.get(`${base}/reports/${job.id}`)).body).toMatchObject({
        status: 'FAILED',
        attempts: 2,
        // The user sees a plain message; the cause stays in the worker log.
        error: 'The report could not be generated. Please try again.',
      });
      write.mockRestore();
    });

    it('re-enqueues lost jobs and expires old files in the sweep', async () => {
      queue.down = true;
      const { body: lost } = await request(owner, {
        type: 'vaccinations',
        idempotencyKey: 'lost-job-0001',
      }).expect(202);
      queue.down = false;
      expect(queue.take('reports.generate')).toEqual([]);

      const { body: old } = await request(owner, { type: 'health_events' }).expect(202);
      await runJobs(app, 'reports.generate');

      const organizationId = base.split('/').at(-1)!;
      const later = new Date(Date.now() + 8 * DAY_MS);
      const swept = await app.get(ReportsService).sweep(organizationId, later);
      expect(swept.requeued).toBeGreaterThanOrEqual(1);
      expect(swept.expired).toBeGreaterThanOrEqual(1);
      expect(queue.take('reports.generate').map((job) => job.data.reportJobId)).toContain(lost.id);

      const { body } = await owner.get(`${base}/reports/${old.id}`).expect(200);
      expect(body).toMatchObject({ status: 'EXPIRED', downloadable: false });
      await download(owner, old.id).expect(410);
    });

    it('limits how many reports one member can have in progress', async () => {
      const organizationId = base.split('/').at(-1)!;
      // Clear the queue state left by earlier tests.
      await app.get(ReportsService).sweep(organizationId, new Date(Date.now() + DAY_MS));
      await runJobs(app, 'reports.generate');
      for (let i = 0; i < 5; i++) await request(manager, { type: 'alerts' }).expect(202);
      await request(manager, { type: 'alerts' }).expect(429);
      await runJobs(app, 'reports.generate');
      await request(manager, { type: 'alerts' }).expect(202);
    });
  });

  describe('direct exports', () => {
    it('downloads a CSV straight away for a short range', async () => {
      const response = await owner
        .get(`${base}/exports/daily_production?from=2026-10-01&to=2026-10-07&farmId=${farmId}`)
        .expect(200);
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="daily_production_2026-10-01_2026-10-07.csv"',
      );
      const [header, ...days] = rows(response.text);
      expect(header!.slice(0, 4)).toEqual(['Date', 'Farm', 'House', 'Flock']);
      expect(days).toHaveLength(7);
      expect(days.map((day) => day[header!.indexOf('Eggs')])).toEqual(Array(7).fill('900'));
    });

    it('keeps a formula typed into a note as text', async () => {
      const response = await owner
        .get(`${base}/exports/mortality?from=2026-10-03&to=2026-10-03`)
        .expect(200);
      expect(response.text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    });

    it('sends long ranges to report jobs instead', async () => {
      const { body } = await owner
        .get(`${base}/exports/mortality?from=2026-01-01&to=2026-10-31`)
        .expect(400);
      expect(body.issues[0].message).toMatch(/at most 92 days/);
    });

    it('applies the same per-report access and records an audit entry', async () => {
      await worker.get(`${base}/exports/mortality`).expect(403);
      await worker.get(`${base}/exports/my_entries`).expect(200);
      await owner.get(`${base}/exports/payroll`).expect(400);
      const audit = (await owner.get(`${base}/audit-logs?limit=10`).expect(200)).body.items;
      expect(audit.map((entry: { action: string }) => entry.action)).toContain('report.exported');
    });
  });
});
