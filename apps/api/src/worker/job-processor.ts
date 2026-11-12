import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { JOB_QUEUE, type JobName, type JobPayloads, type JobQueue } from '../jobs/jobs.js';
import { AlertsService } from '../modules/alerts/alerts.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { ReportsService } from '../modules/reports/reports.service.js';

/** A notification email still pending after this long has probably lost its job. */
const EMAIL_REQUEUE_AFTER_MS = 5 * 60_000;

export interface JobContext {
  /** No retry follows if this attempt fails: record the failure for the user. */
  finalAttempt: boolean;
  /** When the job runs; scheduled fan-outs use it to name the jobs they create. */
  now: Date;
}

/**
 * What each background job does. Kept apart from BullMQ so it can be tested
 * (and run by hand) without a queue: every job loads current state from the
 * database and works inside one organization's tenant context.
 */
@Injectable()
export class JobProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  handle<K extends JobName>(name: K, data: JobPayloads[K], context: JobContext): Promise<unknown>;
  async handle(name: JobName, data: never, context: JobContext): Promise<unknown> {
    switch (name) {
      case 'reports.generate': {
        const { organizationId, reportJobId } = data as JobPayloads['reports.generate'];
        return this.reports.generate(organizationId, reportJobId, context.finalAttempt);
      }
      case 'alerts.evaluate': {
        const { organizationId } = data as JobPayloads['alerts.evaluate'];
        return this.alerts.evaluate({ organizationId, userId: null }, {});
      }
      case 'alerts.evaluate-all':
        return this.evaluateAll(context.now);
      case 'email.send': {
        const { organizationId, notificationId } = data as JobPayloads['email.send'];
        return this.notifications.deliverEmail(
          organizationId,
          notificationId,
          context.finalAttempt,
        );
      }
      case 'maintenance.sweep':
        return this.sweep(context.now);
    }
  }

  /**
   * One evaluation job per active organization, named by the hour so a
   * scheduler firing twice in an hour (a restart) doesn't evaluate twice.
   */
  private async evaluateAll(now: Date) {
    const hour = now.toISOString().slice(0, 13).replace('T', '-');
    const organizations = await this.prisma.activeOrganizationIds();
    for (const organizationId of organizations) {
      await this.queue.enqueue(
        'alerts.evaluate',
        { organizationId },
        { jobId: `alerts-${organizationId}-${hour}` },
      );
    }
    return { organizations: organizations.length };
  }

  /** Recovers work whose queue entry was lost and cleans up expired files. */
  private async sweep(now: Date) {
    const totals = { requeued: 0, failed: 0, expired: 0, emails: 0 };
    for (const organizationId of await this.prisma.activeOrganizationIds()) {
      const reports = await this.reports.sweep(organizationId, now);
      totals.requeued += reports.requeued;
      totals.failed += reports.failed;
      totals.expired += reports.expired;

      const pending = await this.notifications.pendingEmails(
        organizationId,
        new Date(now.getTime() - EMAIL_REQUEUE_AFTER_MS),
      );
      await this.notifications.sendEmails(
        organizationId,
        pending.map((notification) => notification.id),
      );
      totals.emails += pending.length;
    }
    return totals;
  }
}
