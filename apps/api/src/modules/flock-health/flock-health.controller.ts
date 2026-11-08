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
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  healthEventSchema,
  listHealthEventsSchema,
  listVaccinationsSchema,
  scheduleVaccinationSchema,
  updateHealthEventSchema,
  updateVaccineSchema,
  vaccinationOutcomeSchema,
  vaccineSchema,
  type HealthEventDto,
  type ListHealthEventsQuery,
  type ListVaccinationsQuery,
  type ScheduleVaccinationDto,
  type UpdateHealthEventDto,
  type UpdateVaccineDto,
  type VaccinationOutcomeDto,
  type VaccineDto,
} from './flock-health.schemas.js';
import { FlockHealthService } from './flock-health.service.js';
import { VaccinesService } from './vaccines.service.js';

/** Reads are open to members; every write needs `health:record`. */
@Controller('organizations/:organizationId')
export class FlockHealthController {
  constructor(
    private readonly vaccines: VaccinesService,
    private readonly health: FlockHealthService,
  ) {}

  @Get('vaccines')
  listVaccines(@Tenant() tenant: TenantContext) {
    return this.vaccines.list(tenant);
  }

  @Post('vaccines')
  @RequirePermission('health:record')
  createVaccine(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(vaccineSchema)) dto: VaccineDto,
  ) {
    return this.vaccines.create(tenant, dto);
  }

  @Patch('vaccines/:vaccineId')
  @RequirePermission('health:record')
  updateVaccine(
    @Tenant() tenant: TenantContext,
    @Param('vaccineId', ParseUUIDPipe) vaccineId: string,
    @Body(new ZodValidationPipe(updateVaccineSchema)) dto: UpdateVaccineDto,
  ) {
    return this.vaccines.update(tenant, vaccineId, dto);
  }

  /** Org-wide schedule; ?dueWithinDays=7 gives what's due this week, overdue included. */
  @Get('vaccinations')
  listVaccinations(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listVaccinationsSchema)) query: ListVaccinationsQuery,
  ) {
    return this.health.listVaccinations(tenant, query);
  }

  @Post('flock-batches/:batchId/vaccinations')
  @RequirePermission('health:record')
  schedule(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodValidationPipe(scheduleVaccinationSchema)) dto: ScheduleVaccinationDto,
  ) {
    return this.health.schedule(tenant, batchId, dto);
  }

  @Post('flock-batches/:batchId/vaccinations/:vaccinationId/outcome')
  @HttpCode(200)
  @RequirePermission('health:record')
  recordOutcome(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('vaccinationId', ParseUUIDPipe) vaccinationId: string,
    @Body(new ZodValidationPipe(vaccinationOutcomeSchema)) dto: VaccinationOutcomeDto,
  ) {
    return this.health.recordOutcome(tenant, batchId, vaccinationId, dto);
  }

  @Get('health-events')
  listHealthEvents(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listHealthEventsSchema)) query: ListHealthEventsQuery,
  ) {
    return this.health.listHealthEvents(tenant, query);
  }

  @Post('flock-batches/:batchId/health-events')
  @RequirePermission('health:record')
  recordHealthEvent(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodValidationPipe(healthEventSchema)) dto: HealthEventDto,
  ) {
    return this.health.recordHealthEvent(tenant, batchId, dto);
  }

  @Patch('flock-batches/:batchId/health-events/:eventId')
  @RequirePermission('health:record')
  updateHealthEvent(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(updateHealthEventSchema)) dto: UpdateHealthEventDto,
  ) {
    return this.health.updateHealthEvent(tenant, batchId, eventId, dto);
  }
}
