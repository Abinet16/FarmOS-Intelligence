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
  createFarmSchema,
  listFarmsSchema,
  updateFarmSchema,
  type CreateFarmDto,
  type ListFarmsQuery,
  type UpdateFarmDto,
} from './farms.schemas.js';
import { FarmsService } from './farms.service.js';

@Controller('organizations/:organizationId/farms')
export class FarmsController {
  constructor(private readonly farms: FarmsService) {}

  /** Any member can read the farm structure; recording needs it. */
  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listFarmsSchema)) query: ListFarmsQuery,
  ) {
    return this.farms.list(tenant, query);
  }

  @Post()
  @RequirePermission('farm:configure')
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createFarmSchema)) dto: CreateFarmDto,
  ) {
    return this.farms.create(tenant, dto);
  }

  @Get(':farmId')
  get(@Tenant() tenant: TenantContext, @Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.farms.get(tenant, farmId);
  }

  @Patch(':farmId')
  @RequirePermission('farm:configure')
  update(
    @Tenant() tenant: TenantContext,
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body(new ZodValidationPipe(updateFarmSchema)) dto: UpdateFarmDto,
  ) {
    return this.farms.update(tenant, farmId, dto);
  }

  @Post(':farmId/archive')
  @HttpCode(200)
  @RequirePermission('farm:configure')
  archive(@Tenant() tenant: TenantContext, @Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.farms.archive(tenant, farmId);
  }

  @Post(':farmId/restore')
  @HttpCode(200)
  @RequirePermission('farm:configure')
  restore(@Tenant() tenant: TenantContext, @Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.farms.restore(tenant, farmId);
  }
}
