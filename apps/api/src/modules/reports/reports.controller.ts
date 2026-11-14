import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import type { ReportType } from '@farmos/shared-types';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  listReportsSchema,
  reportParametersSchema,
  reportType,
  requestReportSchema,
  type ListReportsQuery,
  type ReportParametersDto,
  type RequestReportDto,
} from './reports.schemas.js';
import { ReportsService } from './reports.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';

const CSV = 'text/csv; charset=utf-8';

/** Content-Disposition for a server-built file name (letters, digits, _ - . only). */
const attachment = (filename: string) => `attachment; filename="${filename}"`;

/**
 * Which reports a member may run depends on the report (most need
 * reports:view; "my entries" is for anyone who records), so the service
 * checks it per type instead of a single route permission.
 */
@Controller('organizations/:organizationId')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports/types')
  catalog(@Tenant() tenant: TenantContext) {
    return this.reports.catalog(tenant);
  }

  @Post('reports')
  @HttpCode(202)
  @RateLimit({ name: 'reports', limit: 20, windowSeconds: 60 })
  request(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(requestReportSchema)) dto: RequestReportDto,
  ) {
    return this.reports.request(tenant, dto);
  }

  @Get('reports')
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listReportsSchema)) query: ListReportsQuery,
  ) {
    return this.reports.list(tenant, query);
  }

  @Get('reports/:reportJobId')
  get(@Tenant() tenant: TenantContext, @Param('reportJobId', ParseUUIDPipe) reportJobId: string) {
    return this.reports.get(tenant, reportJobId);
  }

  @Get('reports/:reportJobId/download')
  @Header('Cache-Control', 'no-store')
  async download(
    @Tenant() tenant: TenantContext,
    @Param('reportJobId', ParseUUIDPipe) reportJobId: string,
  ) {
    const { file, filename } = await this.reports.download(tenant, reportJobId);
    return new StreamableFile(file, { type: CSV, disposition: attachment(filename) });
  }

  @Get('exports/:type')
  @RateLimit({ name: 'exports', limit: 30, windowSeconds: 60 })
  @Header('Cache-Control', 'no-store')
  async export(
    @Tenant() tenant: TenantContext,
    @Param('type', new ZodValidationPipe(reportType)) type: ReportType,
    @Query(new ZodValidationPipe(reportParametersSchema)) query: ReportParametersDto,
  ) {
    const { csv, filename } = await this.reports.export(tenant, type, query);
    return new StreamableFile(Buffer.from(csv), { type: CSV, disposition: attachment(filename) });
  }
}
