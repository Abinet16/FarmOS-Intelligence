import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  severityAtLeast,
  type NotificationKind,
  type NotificationPreferences,
  type Severity,
} from '@farmos/shared-types';
import type { TenantContext } from '../../common/request.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import { JOB_QUEUE, type JobQueue } from '../../jobs/jobs.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  ListNotificationsQuery,
  NotificationPreferencesDto,
} from './notifications.schemas.js';

/** One notification for one recipient, before it is stored. */
export interface NotificationDraft {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Path in the web app relative to the organization, e.g. /reports. */
  link?: string;
  /** Identifies the event; the same event never notifies the same person twice. */
  dedupeKey: string;
  /** For alerts: decides whether it is emailed under the recipient's preferences. */
  severity?: Severity;
}

const notificationSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

function wantsEmail(preferences: NotificationPreferences, draft: NotificationDraft): boolean {
  if (draft.kind === 'alert.raised') {
    const minimum = preferences.emailAlertsMinSeverity;
    return (
      minimum !== null && draft.severity !== undefined && severityAtLeast(draft.severity, minimum)
    );
  }
  return preferences.emailReports;
}

/**
 * In-app notifications and their email copies. A notification is private to
 * its recipient. Notifications are created inside the transaction that
 * produced the event; emails are queued after it commits (the email status
 * column is the outbox, so a lost job is picked up by the maintenance sweep).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(tenant: TenantContext, query: ListNotificationsQuery) {
    const where = {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      ...(query.unread !== undefined && { readAt: query.unread ? null : { not: null } }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.notification.findMany({
          where,
          select: notificationSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...pageArgs(query),
        }),
        tx.notification.count({ where }),
      ]);
      return toPage(items, total, query);
    });
  }

  unreadCount(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, async (tx) => ({
      unread: await tx.notification.count({
        where: { organizationId: tenant.organizationId, userId: tenant.userId, readAt: null },
      }),
    }));
  }

  markRead(tenant: TenantContext, notificationId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const own = {
        id: notificationId,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
      };
      const { count } = await tx.notification.updateMany({
        where: { ...own, readAt: null },
        data: { readAt: new Date() },
      });
      const notification = await tx.notification.findFirst({
        where: own,
        select: notificationSelect,
      });
      if (!notification) throw new NotFoundException('Notification not found');
      return { ...notification, changed: count > 0 };
    });
  }

  markAllRead(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const { count } = await tx.notification.updateMany({
        where: { organizationId: tenant.organizationId, userId: tenant.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { marked: count };
    });
  }

  getPreferences(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const [preferences] = await this.preferences(tx, tenant.organizationId, [tenant.userId]);
      return preferences!.preferences;
    });
  }

  updatePreferences(tenant: TenantContext, dto: NotificationPreferencesDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const key = { organizationId: tenant.organizationId, userId: tenant.userId };
      await tx.notificationPreference.upsert({
        where: { organizationId_userId: key },
        create: { ...key, ...dto },
        update: dto,
      });
      await this.audit.record(tx, tenant, {
        action: 'notification_preferences.updated',
        entityType: 'membership',
        metadata: { ...dto },
      });
      return dto;
    });
  }

  /**
   * Stores notifications inside the caller's transaction and returns the ids
   * that should be emailed. Pass them to sendEmails() after the commit.
   */
  async create(tx: Tx, organizationId: string, drafts: NotificationDraft[]): Promise<string[]> {
    if (drafts.length === 0) return [];
    const userIds = [...new Set(drafts.map((draft) => draft.userId))];
    const preferences = new Map(
      (await this.preferences(tx, organizationId, userIds)).map((row) => [
        row.userId,
        row.preferences,
      ]),
    );
    const created = await tx.notification.createManyAndReturn({
      data: drafts.map((draft) => ({
        organizationId,
        userId: draft.userId,
        kind: draft.kind,
        title: draft.title.slice(0, 200),
        body: draft.body.slice(0, 1000),
        link: draft.link,
        dedupeKey: draft.dedupeKey,
        emailStatus: wantsEmail(preferences.get(draft.userId)!, draft) ? 'PENDING' : 'NONE',
      })),
      skipDuplicates: true,
      select: { id: true, emailStatus: true },
    });
    return created.filter((row) => row.emailStatus === 'PENDING').map((row) => row.id);
  }

  /** Queues the email copies of notifications created in a committed transaction. */
  async sendEmails(organizationId: string, notificationIds: string[]): Promise<void> {
    for (const notificationId of notificationIds) {
      await this.queue.enqueue(
        'email.send',
        { organizationId, notificationId },
        { jobId: `email-${notificationId}` },
      );
    }
  }

  /**
   * Worker: emails one notification if it is still pending and its recipient
   * is still a member. Throws on a delivery failure so the job is retried;
   * after the last attempt the notification is marked FAILED.
   */
  async deliverEmail(organizationId: string, notificationId: string, finalAttempt: boolean) {
    const found = await this.prisma.withOrganization(organizationId, async (tx) => {
      const notification = await tx.notification.findFirst({
        where: { id: notificationId, organizationId, emailStatus: 'PENDING' },
        include: {
          user: { select: { email: true } },
          organization: { select: { name: true } },
        },
      });
      const membership =
        notification &&
        (await tx.membership.findFirst({
          where: { organizationId, userId: notification.userId },
          select: { id: true },
        }));
      return { notification, isMember: Boolean(membership) };
    });
    const { notification } = found;
    if (!notification) return 'skipped';
    if (!found.isMember) {
      // Removed from the organization since: no email about its data.
      await this.setEmailStatus(organizationId, notificationId, 'NONE');
      return 'skipped';
    }

    const link = notification.link
      ? `\n\n${this.env.WEB_URL}/organizations/${organizationId}${notification.link}`
      : '';
    try {
      await this.mailer.send({
        to: notification.user.email,
        subject: `[${notification.organization.name}] ${notification.title}`,
        text: `${notification.body}${link}\n\nYou can change which emails you receive in FarmOS under Notifications.`,
      });
    } catch (error) {
      if (finalAttempt) await this.setEmailStatus(organizationId, notificationId, 'FAILED');
      throw error;
    }
    await this.setEmailStatus(organizationId, notificationId, 'SENT');
    return 'sent';
  }

  /** Pending emails whose job may have been lost, for the maintenance sweep. */
  pendingEmails(organizationId: string, olderThan: Date) {
    return this.prisma.withOrganization(organizationId, (tx) =>
      tx.notification.findMany({
        where: { organizationId, emailStatus: 'PENDING', createdAt: { lt: olderThan } },
        select: { id: true },
        take: 500,
      }),
    );
  }

  private setEmailStatus(organizationId: string, id: string, status: 'SENT' | 'FAILED' | 'NONE') {
    return this.prisma.withOrganization(organizationId, (tx) =>
      tx.notification.update({
        where: { id },
        data: { emailStatus: status, ...(status === 'SENT' && { emailedAt: new Date() }) },
      }),
    );
  }

  private async preferences(tx: Tx, organizationId: string, userIds: string[]) {
    const rows = await tx.notificationPreference.findMany({
      where: { organizationId, userId: { in: userIds } },
    });
    const byUser = new Map(rows.map((row) => [row.userId, row]));
    return userIds.map((userId) => {
      const row = byUser.get(userId);
      const preferences: NotificationPreferences = row
        ? { emailAlertsMinSeverity: row.emailAlertsMinSeverity, emailReports: row.emailReports }
        : DEFAULT_NOTIFICATION_PREFERENCES;
      return { userId, preferences };
    });
  }
}
