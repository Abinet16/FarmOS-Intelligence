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
  changeStatusSchema,
  createFlockBatchSchema,
  listFlockBatchesSchema,
  updateFlockBatchSchema,
  type ChangeStatusDto,
  type CreateFlockBatchDto,
  type ListFlockBatchesQuery,
  type UpdateFlockBatchDto,
} from './flock-batches.schemas.js';
import { FlockBatchesService } from './flock-batches.service.js';

@Controller('organizations/:organizationId/flock-batches')
export class FlockBatchesController {
  constructor(private readonly batches: FlockBatchesService) {}

  /** Any member can read batches; filter by status, purpose, farm or house. */
  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listFlockBatchesSchema)) query: ListFlockBatchesQuery,
  ) {
    return this.batches.list(tenant, query);
  }

  @Post()
  @RequirePermission('farm:configure')
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createFlockBatchSchema)) dto: CreateFlockBatchDto,
  ) {
    return this.batches.create(tenant, dto);
  }

  @Get(':batchId')
  get(@Tenant() tenant: TenantContext, @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.batches.get(tenant, batchId);
  }

  @Patch(':batchId')
  @RequirePermission('farm:configure')
  update(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodValidationPipe(updateFlockBatchSchema)) dto: UpdateFlockBatchDto,
  ) {
    return this.batches.update(tenant, batchId, dto);
  }

  /** Moves a batch through its lifecycle: PLANNED → ACTIVE → DEPLETED → CLOSED. */
  @Post(':batchId/status')
  @HttpCode(200)
  @RequirePermission('farm:configure')
  changeStatus(
    @Tenant() tenant: TenantContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) dto: ChangeStatusDto,
  ) {
    return this.batches.changeStatus(tenant, batchId, dto);
  }
}
