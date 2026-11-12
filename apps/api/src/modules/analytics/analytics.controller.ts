import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import { analyticsQuerySchema, type AnalyticsQuery } from './analytics.schemas.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * Dashboards need `reports:view`. Field workers (`reports:view-limited`) get
 * the "my entries" report instead (see the reports module).
 */
@Controller('organizations/:organizationId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermission('reports:view')
  overview(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.overview(tenant, query);
  }

  @Get('trend')
  @RequirePermission('reports:view')
  trend(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.trend(tenant, query);
  }

  @Get('farms')
  @RequirePermission('reports:view')
  farms(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.farms(tenant, query);
  }

  @Get('flocks')
  @RequirePermission('reports:view')
  flocks(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.flocks(tenant, query);
  }

  @Get('flocks/:batchId')
  @RequirePermission('reports:view')
  flock(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analytics.flock(tenant, batchId, query);
  }
}
