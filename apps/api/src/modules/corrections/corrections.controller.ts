import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  listCorrectionsSchema,
  rejectCorrectionSchema,
  requestCorrectionSchema,
  reviewCorrectionSchema,
  type ListCorrectionsQuery,
  type RequestCorrectionDto,
  type ReviewCorrectionDto,
} from './corrections.schemas.js';
import { CorrectionsService } from './corrections.service.js';

@Controller('organizations/:organizationId')
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  @Post('flock-batches/:batchId/production-logs/:logId/corrections')
  @RequirePermission('production:record')
  request(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('logId', ParseUUIDPipe) logId: string,
    @Body(new ZodValidationPipe(requestCorrectionSchema)) dto: RequestCorrectionDto,
  ) {
    return this.corrections.request(tenant, batchId, logId, dto);
  }

  /** The review queue; filter with ?status=PENDING. */
  @Get('corrections')
  @RequirePermission('production:approve-correction')
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listCorrectionsSchema)) query: ListCorrectionsQuery,
  ) {
    return this.corrections.list(tenant, query);
  }

  @Post('corrections/:correctionId/approve')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  approve(
    @Tenant() tenant: TenantContext,
    @Param('correctionId', ParseUUIDPipe) correctionId: string,
    @Body(new ZodValidationPipe(reviewCorrectionSchema)) dto: ReviewCorrectionDto,
  ) {
    return this.corrections.approve(tenant, correctionId, dto);
  }

  @Post('corrections/:correctionId/reject')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  reject(
    @Tenant() tenant: TenantContext,
    @Param('correctionId', ParseUUIDPipe) correctionId: string,
    @Body(new ZodValidationPipe(rejectCorrectionSchema)) dto: ReviewCorrectionDto,
  ) {
    return this.corrections.reject(tenant, correctionId, dto);
  }
}
