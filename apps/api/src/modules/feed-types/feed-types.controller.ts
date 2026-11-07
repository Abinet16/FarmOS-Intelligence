import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import { feedTypeSchema, type FeedTypeDto } from './feed-types.schemas.js';
import { FeedTypesService } from './feed-types.service.js';

@Controller('organizations/:organizationId/feed-types')
export class FeedTypesController {
  constructor(private readonly feedTypes: FeedTypesService) {}

  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.feedTypes.list(tenant);
  }

  @Post()
  @RequirePermission('farm:configure')
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(feedTypeSchema)) dto: FeedTypeDto,
  ) {
    return this.feedTypes.create(tenant, dto);
  }

  @Patch(':feedTypeId')
  @RequirePermission('farm:configure')
  rename(
    @Tenant() tenant: TenantContext,
    @Param('feedTypeId', ParseUUIDPipe) feedTypeId: string,
    @Body(new ZodValidationPipe(feedTypeSchema)) dto: FeedTypeDto,
  ) {
    return this.feedTypes.rename(tenant, feedTypeId, dto);
  }
}
