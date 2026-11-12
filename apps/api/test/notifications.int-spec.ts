import type { INestApplication } from '@nestjs/common';
import { JOB_QUEUE } from '../src/jobs/jobs.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { MAILER } from '../src/mail/mailer.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { createTestApp, signUp } from './support/app.js';
import { addMember, createFarmWithFlock, send, type Agent } from './support/fixtures.js';
import { jobProcessor, RecordingJobQueue, RecordingMailer, runJobs } from './support/jobs.js';

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
}

/**
 * Notifications from alert evaluation: a steady week of 1,000 layers, then a
 * bad day on 8 Oct (12 deaths, hen-day down to 80%) that raises a critical
 * mortality alert and a high hen-day alert.
 */
describe('notifications', () => {
  let app: INestApplication;
  let queue: RecordingJobQueue;
  let mailer: RecordingMailer;
  let owner: Agent;
  let supervisor: Agent;
  let vet: Agent;
  let worker: Agent;
  let supervisorEmail: string;
  let base: string;
  let org: string;

  const inbox = async (agent: Agent, query = '') =>
    (await agent.get(`${base}/notifications${query}`).expect(200)).body.items as Notification[];
  const unread = async (agent: Agent) =>
    (await agent.get(`${base}/notifications/unread-count`).expect(200)).body.unread as number;

  /**
   * A report notification for the member with this role, created as a job
   * would create it but without queueing its email (as if Redis were down).
   * The supervisor's preferences ask for report emails, so it is PENDING.
   */
  const pendingEmailFor = (role: 'SUPERVISOR', dedupeKey: string) =>
    app.get(PrismaService).withOrganization(org, async (tx) => {
      const { userId } = await tx.membership.findFirstOrThrow({
        where: { organizationId: org, role },
      });
      const [id] = await app.get(NotificationsService).create(tx, org, [
        {
          userId,
          kind: 'report.ready',
          title: 'Test report is ready',
          body: '1 row.',
          link: '/reports',
          dedupeKey,
        },
      ]);
      expect(id).toBeDefined();
      return id!;
    });

  beforeAll(async () => {
    app = await createTestApp();
    queue = app.get(JOB_QUEUE);
    mailer = app.get(MAILER);
    ({ agent: owner } = await signUp(app, 'owner'));
    const s = await signUp(app, 'supervisor');
    const v = await signUp(app, 'vet');
    const w = await signUp(app, 'worker');
    [supervisor, vet, worker, supervisorEmail] = [s.agent, v.agent, w.agent, s.email];
    let batchId: string;
    ({ base, org, batchId } = await createFarmWithFlock(owner, 'Notice Farms'));
    await addMember(owner, base, s.email, 'SUPERVISOR');
    await addMember(owner, base, v.email, 'VETERINARIAN');
    await addMember(owner, base, w.email, 'FIELD_WORKER');

    const feedTypeId = (await send(owner, 'post', `${base}/feed-types`, { name: 'Mash' })).body.id;
    for (let day = 1; day <= 7; day++) {
      await send(owner, 'post', `${base}/flock-batches/${batchId}/daily-entries`, {
        date: `2026-10-0${day}`,
        eggsCollected: 900,
        feed: [{ feedTypeId, quantityKg: 110 }],
      }).expect(201);
    }
    await send(owner, 'post', `${base}/flock-batches/${batchId}/daily-entries`, {
      date: '2026-10-08',
      eggsCollected: 800,
      deaths: [{ quantity: 12, reasonCode: 'UNKNOWN' }],
      feed: [{ feedTypeId, quantityKg: 108 }],
    }).expect(201);
  });

  afterAll(() => app.close());

  describe('preferences', () => {
    it('defaults to in-app only', async () => {
      const { body } = await supervisor.get(`${base}/notification-preferences`).expect(200);
      expect(body).toEqual({ emailAlertsMinSeverity: null, emailReports: false });
    });

    it('lets each member choose which alerts are emailed', async () => {
      const preferences = { emailAlertsMinSeverity: 'CRITICAL', emailReports: true };
      await send(supervisor, 'put', `${base}/notification-preferences`, preferences).expect(200);
      expect((await supervisor.get(`${base}/notification-preferences`)).body).toEqual(preferences);
      // Only the member's own preferences change.
      expect((await owner.get(`${base}/notification-preferences`)).body).toEqual({
        emailAlertsMinSeverity: null,
        emailReports: false,
      });
    });

    it('rejects unknown severities and fields', async () => {
      await send(owner, 'put', `${base}/notification-preferences`, {
        emailAlertsMinSeverity: 'EXTREME',
        emailReports: false,
      }).expect(400);
      await send(owner, 'put', `${base}/notification-preferences`, {
        emailAlertsMinSeverity: null,
        emailReports: false,
        userId: 'someone-else',
      }).expect(400);
    });
  });

  describe('alerts', () => {
    it('notifies the people who act on new alerts, once per evaluation', async () => {
      await send(owner, 'post', `${base}/alerts/evaluate`, { date: '2026-10-08' }).expect(200);

      for (const agent of [owner, supervisor]) {
        expect(await inbox(agent)).toEqual([
          expect.objectContaining({
            kind: 'alert.raised',
            title: '2 new alerts for 2026-10-08',
            body: '1 critical, 1 high: high daily mortality (1), hen-day drop (1).',
            link: '/alerts',
            readAt: null,
          }),
        ]);
      }
      // Veterinarians hear about the mortality alert only; field workers aren't notified.
      expect((await inbox(vet)).map((n) => n.title)).toEqual(['New critical alert for 2026-10-08']);
      expect(await inbox(worker)).toEqual([]);
    });

    it("doesn't notify again when the same day is evaluated again", async () => {
      await send(owner, 'post', `${base}/alerts/evaluate`, { date: '2026-10-08' }).expect(200);
      expect(await inbox(owner)).toHaveLength(1);
    });

    it('emails members whose preferences ask for it', async () => {
      const jobs = queue.take('email.send');
      expect(jobs).toHaveLength(1);
      queue.jobs.push(...jobs);

      expect(await runJobs(app, 'email.send')).toEqual(['sent']);
      expect(mailer.sent).toEqual([
        {
          to: supervisorEmail,
          subject: '[Notice Farms] 2 new alerts for 2026-10-08',
          text: expect.stringContaining(`http://localhost:3000/organizations/${org}/alerts`),
        },
      ]);

      // A repeated delivery job (a retry after a crash) sends nothing more.
      queue.jobs.push(...jobs);
      expect(await runJobs(app, 'email.send')).toEqual(['skipped']);
      expect(mailer.sent).toHaveLength(1);
    });
  });

  describe('inbox', () => {
    it('counts and marks notifications read', async () => {
      expect(await unread(owner)).toBe(1);
      const [notification] = await inbox(owner);
      const { body } = await send(
        owner,
        'post',
        `${base}/notifications/${notification!.id}/read`,
      ).expect(200);
      expect(body).toMatchObject({
        id: notification!.id,
        changed: true,
        readAt: expect.any(String),
      });
      expect(await unread(owner)).toBe(0);
      expect(await inbox(owner, '?unread=true')).toEqual([]);
      expect(await inbox(owner, '?unread=false')).toHaveLength(1);
    });

    it('marks everything read at once', async () => {
      expect(await unread(supervisor)).toBe(1);
      const { body } = await send(supervisor, 'post', `${base}/notifications/read-all`).expect(200);
      expect(body).toEqual({ marked: 1 });
      expect(await unread(supervisor)).toBe(0);
    });

    it("keeps each member's notifications private", async () => {
      const [vetNotification] = await inbox(vet);
      await send(owner, 'post', `${base}/notifications/${vetNotification!.id}/read`).expect(404);
      expect(await unread(vet)).toBe(1);
    });
  });

  describe('email failures', () => {
    it('retries delivery and marks the email failed after the last attempt', async () => {
      const notifications = app.get(NotificationsService);
      const pendingId = await pendingEmailFor('SUPERVISOR', 'test-email-failure');

      mailer.failing = true;
      await expect(notifications.deliverEmail(org, pendingId, false)).rejects.toThrow(
        'mail provider unavailable',
      );
      // Still pending, so the maintenance sweep would queue it again.
      const later = new Date(Date.now() + 10 * 60_000);
      expect((await notifications.pendingEmails(org, later)).map((n) => n.id)).toContain(pendingId);

      await expect(notifications.deliverEmail(org, pendingId, true)).rejects.toThrow();
      expect((await notifications.pendingEmails(org, later)).map((n) => n.id)).not.toContain(
        pendingId,
      );
      mailer.failing = false;
    });
  });

  describe('scheduled evaluation', () => {
    it('evaluates every active organization as the system', async () => {
      const processor = jobProcessor(app);
      const now = new Date('2026-11-12T10:15:00Z');
      const result = await processor.handle('alerts.evaluate-all', {}, { finalAttempt: true, now });
      expect(result).toMatchObject({ organizations: expect.any(Number) });

      const jobs = queue.take('alerts.evaluate');
      const ours = jobs.find((job) => job.data.organizationId === org);
      expect(ours?.options.jobId).toBe(`alerts-${org}-2026-11-12-10`);

      // The same hour again enqueues nothing new.
      queue.jobs.push(...jobs);
      await processor.handle('alerts.evaluate-all', {}, { finalAttempt: true, now });
      expect(queue.take('alerts.evaluate')).toHaveLength(jobs.length);

      await processor.handle('alerts.evaluate', ours!.data, { finalAttempt: true, now });
      const audit = (await owner.get(`${base}/audit-logs?limit=5`).expect(200)).body.items as {
        action: string;
        actor: unknown;
        metadata: { scheduled?: boolean };
      }[];
      expect(audit[0]).toMatchObject({
        action: 'alerts.evaluated',
        actor: null,
        metadata: { scheduled: true },
      });
    });

    it('re-queues emails whose job was lost in the sweep', async () => {
      queue.take('email.send');
      const lost = await pendingEmailFor('SUPERVISOR', 'test-lost-email');
      expect(queue.take('email.send')).toEqual([]);

      await jobProcessor(app).handle(
        'maintenance.sweep',
        {},
        { finalAttempt: true, now: new Date(Date.now() + 10 * 60_000) },
      );
      expect(queue.take('email.send').map((job) => job.data.notificationId)).toContain(lost);
    });
  });
});
