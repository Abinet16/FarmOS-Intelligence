import { Controller, Get } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@farmos/shared-types';
import { CurrentUser } from '../../common/decorators/context.decorators.js';
import type { AuthContext } from '../../common/request.js';
import { PrismaService } from '../../database/prisma.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in user and, per organization, their role and permissions. */
  @Get()
  async me(@CurrentUser() user: AuthContext['user']) {
    const memberships = await this.prisma.withUser(user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id },
        select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
        orderBy: { organization: { name: 'asc' } },
      }),
    );
    return {
      user,
      memberships: memberships.map(({ role, organization }) => ({
        organization,
        role,
        permissions: ROLE_PERMISSIONS[role],
      })),
    };
  }
}
