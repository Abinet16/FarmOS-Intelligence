import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  alertSettingsSchema,
  evaluateAlertsSchema,
  listAlertsSchema,
  type AlertSettingsDto,
  type EvaluateAlertsDto,
  type ListAlertsQuery,
} from './alerts.schemas.js';
import { AlertsService } from './alerts.service.js';

/**
 * Any member sees alerts, so the field team knows what needs attention.
 * Supervisors and above evaluate, acknowledge and resolve them; managers set
 * the thresholds.
 */
@Controller('organizations/:organizationId')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('alerts')
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listAlertsSchema)) query: ListAlertsQuery,
  ) {
    return this.alerts.list(tenant, query);
  }

  @Post('alerts/evaluate')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  evaluate(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(evaluateAlertsSchema)) dto: EvaluateAlertsDto,
  ) {
    return this.alerts.evaluate(tenant, dto);
  }

  @Post('alerts/:alertId/acknowledge')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  acknowledge(@Tenant() tenant: TenantContext, @Param('alertId', ParseUUIDPipe) alertId: string) {
    return this.alerts.acknowledge(tenant, alertId);
  }

  @Post('alerts/:alertId/resolve')
  @HttpCode(200)
  @RequirePermission('production:approve-correction')
  resolve(@Tenant() tenant: TenantContext, @Param('alertId', ParseUUIDPipe) alertId: string) {
    return this.alerts.resolve(tenant, alertId);
  }

  @Get('alert-settings')
  getSettings(@Tenant() tenant: TenantContext) {
    return this.alerts.getSettings(tenant);
  }

  @Put('alert-settings')
  @RequirePermission('farm:configure')
  updateSettings(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(alertSettingsSchema)) dto: AlertSettingsDto,
  ) {
    return this.alerts.updateSettings(tenant, dto);
  }
}
