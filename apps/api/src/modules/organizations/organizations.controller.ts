import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CurrentUser, Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthContext, TenantContext } from '../../common/request.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationDto,
  type UpdateOrganizationDto,
} from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @RateLimit({ name: 'organizations', limit: 20, windowSeconds: 3600 })
  create(
    @CurrentUser() user: AuthContext['user'],
    @Body(new ZodValidationPipe(createOrganizationSchema)) dto: CreateOrganizationDto,
  ) {
    return this.organizations.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthContext['user']) {
    return this.organizations.listForUser(user.id);
  }

  /** Any member may read their organization. */
  @Get(':organizationId')
  get(@Tenant() tenant: TenantContext) {
    return this.organizations.get(tenant);
  }

  @Patch(':organizationId')
  @RequirePermission('organization:manage')
  update(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(tenant, dto);
  }
}
