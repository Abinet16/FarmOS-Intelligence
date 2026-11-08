import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  VOIDABLE_KINDS,
  dailyEntrySchema,
  dateRangeSchema,
  updateProductionLogSchema,
  voidRecordSchema,
  type DailyEntryDto,
  type DateRangeQuery,
  type UpdateProductionLogDto,
  type VoidableKind,
  type VoidRecordDto,
} from './flock-records.schemas.js';
import { FlockRecordsService } from './flock-records.service.js';

@Controller('organizations/:organizationId/flock-batches/:batchId')
export class FlockRecordsController {
  constructor(private readonly records: FlockRecordsService) {}

  @Post('daily-entries')
  @RequirePermission('production:record')
  recordDay(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodValidationPipe(dailyEntrySchema)) dto: DailyEntryDto,
  ) {
    return this.records.recordDay(tenant, batchId, dto);
  }

  /** Any member can read records; the field team needs to see what was entered. */
  @Get('records')
  list(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query(new ZodValidationPipe(dateRangeSchema)) range: DateRangeQuery,
  ) {
    return this.records.listRecords(tenant, batchId, range);
  }

  @Get('daily-metrics')
  dailyMetrics(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query(new ZodValidationPipe(dateRangeSchema)) range: DateRangeQuery,
  ) {
    return this.records.dailyMetrics(tenant, batchId, range);
  }

  @Patch('production-logs/:logId')
  @RequirePermission('production:record')
  updateProductionLog(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('logId', ParseUUIDPipe) logId: string,
    @Body(new ZodValidationPipe(updateProductionLogSchema)) dto: UpdateProductionLogDto,
  ) {
    return this.records.updateProductionLog(tenant, batchId, logId, dto);
  }

  @Post('production-logs/:logId/approve')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  approveProductionLog(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('logId', ParseUUIDPipe) logId: string,
  ) {
    return this.records.approveProductionLog(tenant, batchId, logId);
  }

  @Post(':kind/:recordId/void')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  voidRecord(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('kind', new ZodValidationPipe(z.enum(VOIDABLE_KINDS))) kind: VoidableKind,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body(new ZodValidationPipe(voidRecordSchema)) dto: VoidRecordDto,
  ) {
    return this.records.voidRecord(tenant, batchId, kind, recordId, dto);
  }
}
