import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { AppRequest, AuthContext, TenantContext } from '../request.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext['user'] => {
    const auth = ctx.switchToHttp().getRequest<AppRequest>().auth;
    if (!auth) throw new InternalServerErrorException('CurrentUser used on a public route');
    return auth.user;
  },
);

export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const tenant = ctx.switchToHttp().getRequest<AppRequest>().tenant;
    if (!tenant)
      throw new InternalServerErrorException('Tenant used on a route without :organizationId');
    return tenant;
  },
);
