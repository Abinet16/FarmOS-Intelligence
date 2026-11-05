import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@farmos/shared-types';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { AuditService } from '../audit/audit.service.js';
import type { AddMemberDto, UpdateMemberDto } from './memberships.schemas.js';

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, (tx) =>
      tx.membership.findMany({
        where: { organizationId: tenant.organizationId },
        select: memberSelect,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /** Adds an existing user. Email invitations for new users come later. */
  add(tenant: TenantContext, dto: AddMemberDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const user = await tx.user.findUnique({ where: { email: dto.email }, select: { id: true } });
      if (!user) throw new NotFoundException('No user is registered with that email');

      const member = await tx.membership.create({
        data: { organizationId: tenant.organizationId, userId: user.id, role: dto.role },
        select: memberSelect,
      });
      await this.audit.record(tx, tenant, {
        action: 'membership.created',
        entityType: 'membership',
        entityId: member.id,
        metadata: { userId: user.id, role: dto.role },
      });
      return member;
    });
  }

  updateRole(tenant: TenantContext, membershipId: string, dto: UpdateMemberDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const current = await this.findOrThrow(tx, tenant, membershipId);
      if (current.role === dto.role) return this.toMember(tx, membershipId);
      if (current.role === 'OWNER') await this.assertAnotherOwner(tx, tenant, membershipId);

      const member = await tx.membership.update({
        where: { id: membershipId },
        data: { role: dto.role },
        select: memberSelect,
      });
      await this.audit.record(tx, tenant, {
        action: 'membership.role_changed',
        entityType: 'membership',
        entityId: membershipId,
        metadata: { userId: current.userId, from: current.role, to: dto.role },
      });
      return member;
    });
  }

  remove(tenant: TenantContext, membershipId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const current = await this.findOrThrow(tx, tenant, membershipId);
      if (current.role === 'OWNER') await this.assertAnotherOwner(tx, tenant, membershipId);

      await tx.membership.delete({ where: { id: membershipId } });
      await this.audit.record(tx, tenant, {
        action: 'membership.removed',
        entityType: 'membership',
        entityId: membershipId,
        metadata: { userId: current.userId, role: current.role },
      });
    });
  }

  private async findOrThrow(
    tx: Tx,
    tenant: TenantContext,
    membershipId: string,
  ): Promise<{ userId: string; role: Role }> {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: tenant.organizationId },
      select: { userId: true, role: true },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return membership;
  }

  private async toMember(tx: Tx, membershipId: string) {
    return tx.membership.findUniqueOrThrow({ where: { id: membershipId }, select: memberSelect });
  }

  /**
   * An organization must always keep at least one owner. Owner rows are locked
   * so two concurrent demotions cannot both pass the check.
   */
  private async assertAnotherOwner(tx: Tx, tenant: TenantContext, excludingId: string) {
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM memberships
      WHERE organization_id = ${tenant.organizationId}::uuid AND role = 'OWNER'
      FOR UPDATE`;
    if (!owners.some((owner) => owner.id !== excludingId)) {
      throw new ConflictException('An organization must keep at least one owner');
    }
  }
}
