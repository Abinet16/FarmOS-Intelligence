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
  createHouseSchema,
  listHousesSchema,
  updateHouseSchema,
  type CreateHouseDto,
  type ListHousesQuery,
  type UpdateHouseDto,
} from './houses.schemas.js';
import { HousesService } from './houses.service.js';

@Controller('organizations/:organizationId/houses')
export class HousesController {
  constructor(private readonly houses: HousesService) {}

  /** Any member can read houses; filter by farm with ?farmId=. */
  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listHousesSchema)) query: ListHousesQuery,
  ) {
    return this.houses.list(tenant, query);
  }

  @Post()
  @RequirePermission('farm:configure')
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createHouseSchema)) dto: CreateHouseDto,
  ) {
    return this.houses.create(tenant, dto);
  }

  @Get(':houseId')
  get(@Tenant() tenant: TenantContext, @Param('houseId', ParseUUIDPipe) houseId: string) {
    return this.houses.get(tenant, houseId);
  }

  @Patch(':houseId')
  @RequirePermission('farm:configure')
  update(
    @Tenant() tenant: TenantContext,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body(new ZodValidationPipe(updateHouseSchema)) dto: UpdateHouseDto,
  ) {
    return this.houses.update(tenant, houseId, dto);
  }

  @Post(':houseId/archive')
  @HttpCode(200)
  @RequirePermission('farm:configure')
  archive(@Tenant() tenant: TenantContext, @Param('houseId', ParseUUIDPipe) houseId: string) {
    return this.houses.archive(tenant, houseId);
  }

  @Post(':houseId/restore')
  @HttpCode(200)
  @RequirePermission('farm:configure')
  restore(@Tenant() tenant: TenantContext, @Param('houseId', ParseUUIDPipe) houseId: string) {
    return this.houses.restore(tenant, houseId);
  }
}
