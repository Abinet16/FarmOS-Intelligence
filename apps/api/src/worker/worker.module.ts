import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AlertsModule } from '../modules/alerts/alerts.module.js';
import { AuditModule } from '../modules/audit/audit.module.js';
import { NotificationsModule } from '../modules/notifications/notifications.module.js';
import { ReportsModule } from '../modules/reports/reports.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { JobProcessor } from './job-processor.js';
import { WorkerService } from './worker.service.js';

/**
 * The worker process: the same modules as the API (one codebase, one set of
 * business rules) without the HTTP layer.
 */
@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,
    DatabaseModule,
    JobsModule,
    StorageModule,
    MailModule,
    AuditModule,
    NotificationsModule,
    ReportsModule,
    AlertsModule,
  ],
  providers: [JobProcessor, WorkerService],
})
export class WorkerModule {}
