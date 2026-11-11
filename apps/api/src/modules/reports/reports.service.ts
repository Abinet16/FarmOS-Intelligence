import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  canRunReport,
  EXPORT_MAX_RANGE_DAYS,
  EXPORT_MAX_ROWS,
  REPORT_TYPES,
  type ReportType,
  type Role,
} from '@farmos/shared-types';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TenantContext } from '../../common/request.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { organizationToday } from '../../database/organization-today.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import { JOB_QUEUE, type JobQueue } from '../../jobs/jobs.js';
import { FILE_STORE, type FileStore } from '../../storage/file-store.js';
import { AuditService } from '../audit/audit.service.js';
import { dateKey } from '../metrics/flock-metrics.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { REPORTS, TooManyRowsError, type ReportInput } from './report-definitions.js';
import type { ListReportsQuery, ReportParametersDto, RequestReportDto } from './reports.schemas.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Reports one member may have queued or running at once. */
export const MAX_ACTIVE_REPORTS = 5;
/** A job queued this long without starting is assumed lost and enqueued again. */
export const REQUEUE_AFTER_MS = 2 * MINUTE_MS;
/** A job running this long is assumed dead (its worker crashed) and failed. */
export const STUCK_AFTER_MS = 30 * MINUTE_MS;
const DEFAULT_RANGE_DAYS = 30;

const FAILED_MESSAGE = 'The report could not be generated. Please try again.';
const REVOKED_MESSAGE = 'You no longer have access to this report.';

const jobSelect = {
  id: true,
  reportType: true,
  parameters: true,
  status: true,
  attempts: true,
  rowCount: true,
  error: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  expiresAt: true,
} as const satisfies Prisma.ReportJobSelect;

type JobRow = Prisma.ReportJobGetPayload<{ select: typeof jobSelect }>;

function present(job: JobRow) {
  return {
    ...job,
    downloadable:
      job.status === 'SUCCEEDED' && job.expiresAt !== null && job.expiresAt > new Date(),
  };
}

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** The file name a report downloads as, e.g. flock_performance_2026-11-01_2026-11-07.csv. */
export function reportFileName(type: string, parameters: ReportParametersDto, today: string) {
  const span = parameters.from && parameters.to ? `${parameters.from}_${parameters.to}` : today;
  return `${type}_${span}.csv`;
}

/**
 * Reports as CSV, two ways: a direct export for short ranges, and report jobs
 * that the worker generates in the background for anything up to a year.
 * Both use the same definitions and run with the requester's organization and
 * permissions. Report jobs are private to the member who requested them.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(FILE_STORE) private readonly files: FileStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The report types this member may run. */
  catalog(tenant: TenantContext) {
    return Object.entries(REPORT_TYPES)
      .filter(([type]) => canRunReport(tenant.role, type as ReportType))
      .map(([type, info]) => ({ type, ...info }));
  }

  async request(tenant: TenantContext, dto: RequestReportDto) {
    this.assertCanRun(tenant.role, dto.type);
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();

    const { job, created } = await this.prisma.withTenant(tenant, async (tx) => {
      const existing = await tx.reportJob.findUnique({
        where: {
          organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey },
        },
        select: { ...jobSelect, requestedBy: true },
      });
      if (existing) {
        if (existing.requestedBy !== tenant.userId || existing.reportType !== dto.type) {
          throw new ConflictException('This idempotency key was already used for another report');
        }
        const { requestedBy: _requestedBy, ...job } = existing;
        return { job, created: false };
      }

      const active = await tx.reportJob.count({
        where: {
          organizationId: tenant.organizationId,
          requestedBy: tenant.userId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });
      if (active >= MAX_ACTIVE_REPORTS) {
        throw new HttpException(
          `You can have ${MAX_ACTIVE_REPORTS} reports in progress at once. Please wait for one to finish.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const { parameters } = await this.resolve(tx, tenant, dto.type, dto.parameters);
      const job = await tx.reportJob.create({
        data: {
          organizationId: tenant.organizationId,
          requestedBy: tenant.userId,
          reportType: dto.type,
          parameters,
          idempotencyKey,
        },
        select: jobSelect,
      });
      await this.audit.record(tx, tenant, {
        action: 'report.requested',
        entityType: 'report_job',
        entityId: job.id,
        metadata: { type: dto.type, parameters },
      });
      return { job, created: true };
    });

    if (created) await this.enqueue(tenant.organizationId, job.id);
    return { ...present(job), created };
  }

  list(tenant: TenantContext, query: ListReportsQuery) {
    const where = {
      organizationId: tenant.organizationId,
      requestedBy: tenant.userId,
      ...(query.status && { status: query.status }),
    };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.reportJob.findMany({
          where,
          select: jobSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...pageArgs(query),
        }),
        tx.reportJob.count({ where }),
      ]);
      return toPage(items.map(present), total, query);
    });
  }

  get(tenant: TenantContext, reportJobId: string) {
    return this.prisma.withTenant(tenant, async (tx) =>
      present(await this.ownJob(tx, tenant, reportJobId)),
    );
  }

  /** The finished file, streamed. Gone once the retention period has passed. */
  async download(tenant: TenantContext, reportJobId: string) {
    const job = await this.prisma.withTenant(tenant, async (tx) => {
      const job = await this.ownJob(tx, tenant, reportJobId, { fileKey: true });
      if (job.status === 'EXPIRED' || (job.expiresAt && job.expiresAt <= new Date())) {
        throw new GoneException('This report has expired. Please generate it again.');
      }
      if (job.status !== 'SUCCEEDED' || !job.fileKey) {
        throw new ConflictException('This report is not ready yet');
      }
      await this.audit.record(tx, tenant, {
        action: 'report.downloaded',
        entityType: 'report_job',
        entityId: job.id,
        metadata: { type: job.reportType },
      });
      return job;
    });
    const file = await this.files.open(job.fileKey!);
    if (!file) throw new GoneException('This report has expired. Please generate it again.');
    const parameters = job.parameters as ReportParametersDto;
    return { file, filename: reportFileName(job.reportType, parameters, dateKey(job.createdAt)) };
  }

  /** A direct CSV download for a short range; larger ones must be report jobs. */
  async export(tenant: TenantContext, type: ReportType, dto: ReportParametersDto) {
    this.assertCanRun(tenant.role, type);
    return this.prisma.withTenant(tenant, async (tx) => {
      const { input, parameters, today } = await this.resolve(tx, tenant, type, dto, {
        maxRangeDays: EXPORT_MAX_RANGE_DAYS,
      });
      let report;
      try {
        report = await REPORTS[type](tx, input, EXPORT_MAX_ROWS);
      } catch (error) {
        if (error instanceof TooManyRowsError) {
          throw new BadRequestException(
            `This export has more than ${EXPORT_MAX_ROWS.toLocaleString('en')} rows. Generate it as a report instead.`,
          );
        }
        throw error;
      }
      await this.audit.record(tx, tenant, {
        action: 'report.exported',
        entityType: 'organization',
        entityId: tenant.organizationId,
        metadata: { type, parameters, rows: report.rowCount },
      });
      return { csv: report.csv, filename: reportFileName(type, parameters, today) };
    });
  }

  /**
   * Worker: generates one report job. Runs with the requester's current role,
   * so a member who lost access since asking gets nothing. Throws on failure
   * so the queue retries; the last failure marks the job FAILED.
   */
  async generate(organizationId: string, reportJobId: string, finalAttempt: boolean) {
    const claim = await this.prisma.withOrganization(organizationId, async (tx) => {
      const job = await tx.reportJob.findFirst({
        where: { id: reportJobId, organizationId, status: { in: ['QUEUED', 'RUNNING'] } },
      });
      if (!job) return null;
      const membership = await tx.membership.findFirst({
        where: { organizationId, userId: job.requestedBy },
        select: { role: true },
      });
      const type = job.reportType as ReportType;
      if (!membership || !(type in REPORT_TYPES) || !canRunReport(membership.role, type)) {
        return { job, role: null };
      }
      await tx.reportJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() },
      });
      return { job, role: membership.role };
    });
    if (!claim) return 'skipped';
    const { job, role } = claim;
    if (!role) {
      await this.finishFailed(
        organizationId,
        job.id,
        job.requestedBy,
        job.reportType,
        REVOKED_MESSAGE,
      );
      return 'revoked';
    }

    try {
      const tenant = { organizationId, userId: job.requestedBy, role };
      const type = job.reportType as ReportType;
      const report = await this.prisma.withTenant(tenant, async (tx) => {
        const { input } = await this.resolve(
          tx,
          tenant,
          type,
          job.parameters as ReportParametersDto,
        );
        return REPORTS[type](tx, input);
      });
      const fileKey = `${organizationId}/reports/${job.id}.csv`;
      await this.files.write(fileKey, report.csv);
      await this.finishSucceeded(organizationId, job, fileKey, report.rowCount);
      return 'succeeded';
    } catch (error) {
      this.logger.error(
        `Report ${job.id} failed${finalAttempt ? '' : ' (will retry)'}`,
        error instanceof Error ? error.stack : error,
      );
      if (finalAttempt) {
        await this.finishFailed(
          organizationId,
          job.id,
          job.requestedBy,
          job.reportType,
          FAILED_MESSAGE,
        );
      }
      throw error;
    }
  }

  /**
   * Maintenance for one organization: enqueue jobs whose queue entry was lost,
   * fail jobs whose worker died, and delete files past their retention.
   */
  async sweep(organizationId: string, now = new Date()) {
    const { lost, stuck, expired } = await this.prisma.withOrganization(
      organizationId,
      async (tx) => ({
        lost: await tx.reportJob.findMany({
          where: {
            organizationId,
            status: 'QUEUED',
            createdAt: { lt: new Date(now.getTime() - REQUEUE_AFTER_MS) },
          },
          select: { id: true },
          take: 500,
        }),
        stuck: await tx.reportJob.findMany({
          where: {
            organizationId,
            status: 'RUNNING',
            startedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
          },
          select: { id: true, requestedBy: true, reportType: true },
        }),
        expired: await tx.reportJob.findMany({
          where: { organizationId, status: 'SUCCEEDED', expiresAt: { lte: now } },
          select: { id: true, fileKey: true },
        }),
      }),
    );

    for (const job of lost) await this.enqueue(organizationId, job.id);
    for (const job of stuck) {
      await this.finishFailed(
        organizationId,
        job.id,
        job.requestedBy,
        job.reportType,
        FAILED_MESSAGE,
      );
    }
    for (const job of expired) {
      if (job.fileKey) await this.files.delete(job.fileKey);
      await this.prisma.withOrganization(organizationId, (tx) =>
        tx.reportJob.update({ where: { id: job.id }, data: { status: 'EXPIRED', fileKey: null } }),
      );
    }
    return { requeued: lost.length, failed: stuck.length, expired: expired.length };
  }

  private enqueue(organizationId: string, reportJobId: string) {
    return this.queue.enqueue(
      'reports.generate',
      { organizationId, reportJobId },
      { jobId: `report-${reportJobId}` },
    );
  }

  private async finishSucceeded(
    organizationId: string,
    job: { id: string; requestedBy: string; reportType: string; parameters: Prisma.JsonValue },
    fileKey: string,
    rowCount: number,
  ) {
    const completedAt = new Date();
    const expiresAt = new Date(completedAt.getTime() + this.env.REPORT_RETENTION_DAYS * DAY_MS);
    const label = REPORT_TYPES[job.reportType as ReportType].label;
    const parameters = job.parameters as ReportParametersDto;
    const span = parameters.from ? `, ${parameters.from} to ${parameters.to}` : '';
    const emails = await this.prisma.withOrganization(organizationId, async (tx) => {
      await tx.reportJob.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', fileKey, rowCount, completedAt, expiresAt, error: null },
      });
      await this.audit.record(
        tx,
        { organizationId, userId: null },
        {
          action: 'report.generated',
          entityType: 'report_job',
          entityId: job.id,
          metadata: { type: job.reportType, rows: rowCount },
        },
      );
      return this.notifications.create(tx, organizationId, [
        {
          userId: job.requestedBy,
          kind: 'report.ready',
          title: `${label} report is ready`,
          body: `${rowCount} rows${span}. You can download it until ${dateKey(expiresAt)}.`,
          link: `/reports?job=${job.id}`,
          dedupeKey: `report-ready-${job.id}`,
        },
      ]);
    });
    await this.notifications.sendEmails(organizationId, emails);
  }

  private async finishFailed(
    organizationId: string,
    reportJobId: string,
    requestedBy: string,
    reportType: string,
    message: string,
  ) {
    const label = REPORT_TYPES[reportType as ReportType]?.label ?? 'Report';
    const emails = await this.prisma.withOrganization(organizationId, async (tx) => {
      await tx.reportJob.update({
        where: { id: reportJobId },
        data: { status: 'FAILED', error: message, completedAt: new Date() },
      });
      await this.audit.record(
        tx,
        { organizationId, userId: null },
        {
          action: 'report.failed',
          entityType: 'report_job',
          entityId: reportJobId,
          metadata: { type: reportType, error: message },
        },
      );
      return this.notifications.create(tx, organizationId, [
        {
          userId: requestedBy,
          kind: 'report.failed',
          title: `${label} report failed`,
          body: message,
          link: `/reports?job=${reportJobId}`,
          dedupeKey: `report-failed-${reportJobId}`,
        },
      ]);
    });
    await this.notifications.sendEmails(organizationId, emails);
  }

  private assertCanRun(role: Role, type: ReportType) {
    if (!canRunReport(role, type)) {
      throw new ForbiddenException('Your role does not allow this report');
    }
  }

  private async ownJob<S extends Prisma.ReportJobSelect>(
    tx: Tx,
    tenant: TenantContext,
    reportJobId: string,
    extra?: S,
  ) {
    const job = await tx.reportJob.findFirst({
      where: { id: reportJobId, organizationId: tenant.organizationId, requestedBy: tenant.userId },
      select: { ...jobSelect, ...extra },
    });
    if (!job) throw new NotFoundException('Report not found');
    return job as JobRow & Prisma.ReportJobGetPayload<{ select: S }>;
  }

  /**
   * Checks a report's parameters against its type and the organization's
   * records, and fills in the default range (the 30 days ending today).
   */
  private async resolve(
    tx: Tx,
    tenant: Pick<TenantContext, 'organizationId' | 'userId'>,
    type: ReportType,
    dto: ReportParametersDto,
    limits: { maxRangeDays?: number } = {},
  ) {
    const info = REPORT_TYPES[type];
    const allowed: readonly string[] = info.filters;
    for (const filter of ['farmId', 'batchId'] as const) {
      if (dto[filter] && !allowed.includes(filter)) {
        throw invalidField(filter, `not available for the ${info.label} report`);
      }
    }
    const organizationId = tenant.organizationId;
    if (
      dto.farmId &&
      !(await tx.farm.findFirst({
        where: { id: dto.farmId, organizationId },
        select: { id: true },
      }))
    ) {
      throw invalidField('farmId', 'farm not found');
    }
    if (
      dto.batchId &&
      !(await tx.flockBatch.findFirst({
        where: { id: dto.batchId, organizationId },
        select: { id: true },
      }))
    ) {
      throw invalidField('batchId', 'flock not found');
    }

    const today = await organizationToday(tx, organizationId);
    let range: ReportInput['range'] = null;
    if (info.dated) {
      const to = dto.to ? toDate(dto.to) : today;
      const from = dto.from
        ? toDate(dto.from)
        : new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
      if (from > to) throw invalidField('from', 'from must not be after to');
      const maxDays = Math.min(info.maxRangeDays, limits.maxRangeDays ?? Infinity);
      if ((to.getTime() - from.getTime()) / DAY_MS + 1 > maxDays) {
        throw invalidField('from', `this report can cover at most ${maxDays} days`);
      }
      range = { from, to };
    } else if (dto.from || dto.to) {
      throw invalidField(
        'from',
        `the ${info.label} report shows current figures and takes no dates`,
      );
    }

    const parameters: ReportParametersDto = {
      ...(range && { from: dateKey(range.from), to: dateKey(range.to) }),
      ...(dto.farmId && { farmId: dto.farmId }),
      ...(dto.batchId && { batchId: dto.batchId }),
    };
    const input: ReportInput = {
      organizationId,
      userId: tenant.userId,
      range,
      today,
      farmId: dto.farmId,
      batchId: dto.batchId,
    };
    return { input, parameters, today: dateKey(today) };
  }
}
