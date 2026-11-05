import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  addMemberSchema,
  updateMemberSchema,
  type AddMemberDto,
  type UpdateMemberDto,
} from './memberships.schemas.js';
import { MembershipsService } from './memberships.service.js';

@Controller('organizations/:organizationId/members')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  /** Any member can see who else belongs to the organization. */
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.memberships.list(tenant);
  }

  @Post()
  @RequirePermission('access:manage')
  add(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberDto,
  ) {
    return this.memberships.add(tenant, dto);
  }

  @Patch(':membershipId')
  @RequirePermission('access:manage')
  update(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) dto: UpdateMemberDto,
  ) {
    return this.memberships.updateRole(tenant, membershipId, dto);
  }

  @Delete(':membershipId')
  @HttpCode(204)
  @RequirePermission('access:manage')
  remove(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.memberships.remove(tenant, membershipId);
  }
}
