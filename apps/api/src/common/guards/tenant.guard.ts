import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@farmos/shared-types';
import { PrismaService } from '../../database/prisma.service.js';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permission.decorator.js';
import type { AppRequest } from '../request.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global, runs after AuthGuard. Any route with an :organizationId parameter is
 * tenant-scoped: the caller must hold a membership there, and that membership's
 * role must grant every permission named by @RequirePermission().
 *
 * Non-members get 404, not 403, so organization IDs cannot be probed.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const required =
      this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const organizationId = request.params?.organizationId;

    if (organizationId === undefined) {
      if (required.length > 0) {
        throw new InternalServerErrorException('@RequirePermission needs an :organizationId route');
      }
      return true;
    }

    const userId = request.auth?.user.id;
    if (!userId) throw new InternalServerErrorException('TenantGuard ran without authentication');
    if (typeof organizationId !== 'string' || !UUID.test(organizationId)) {
      throw new NotFoundException('Organization not found');
    }

    const membership = await this.prisma.withUser(userId, (tx) =>
      tx.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
      }),
    );
    if (!membership) throw new NotFoundException('Organization not found');

    const missing = required.filter((permission) => !hasPermission(membership.role, permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }

    request.tenant = { organizationId, userId, role: membership.role };
    return true;
  }
}
