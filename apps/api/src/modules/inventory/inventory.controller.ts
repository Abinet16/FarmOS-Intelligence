import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  createItemSchema,
  movementSchema,
  movementsQuerySchema,
  stockQuerySchema,
  transferSchema,
  updateItemSchema,
  type CreateItemDto,
  type MovementDto,
  type MovementsQuery,
  type StockQuery,
  type TransferDto,
  type UpdateItemDto,
} from './inventory.schemas.js';
import { InventoryService } from './inventory.service.js';

/**
 * Items are configured by managers; stock movements are recorded by the field
 * team (`production:record`), which issues feed and supplies day to day.
 */
@Controller('organizations/:organizationId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('items')
  listItems(@Tenant() tenant: TenantContext) {
    return this.inventory.listItems(tenant);
  }

  @Post('items')
  @RequirePermission('farm:configure')
  createItem(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createItemSchema)) dto: CreateItemDto,
  ) {
    return this.inventory.createItem(tenant, dto);
  }

  @Patch('items/:itemId')
  @RequirePermission('farm:configure')
  updateItem(
    @Tenant() tenant: TenantContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto,
  ) {
    return this.inventory.updateItem(tenant, itemId, dto);
  }

  @Get('stock')
  stock(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(stockQuerySchema)) query: StockQuery,
  ) {
    return this.inventory.stock(tenant, query);
  }

  @Get('movements')
  movements(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(movementsQuerySchema)) query: MovementsQuery,
  ) {
    return this.inventory.movements(tenant, query);
  }

  @Post('movements')
  @RequirePermission('production:record')
  recordMovement(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(movementSchema)) dto: MovementDto,
  ) {
    return this.inventory.recordMovement(tenant, dto);
  }

  @Post('transfers')
  @RequirePermission('production:record')
  transfer(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(transferSchema)) dto: TransferDto,
  ) {
    return this.inventory.transfer(tenant, dto);
  }
}
