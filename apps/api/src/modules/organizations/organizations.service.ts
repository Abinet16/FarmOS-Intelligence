import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { AuditService } from '../audit/audit.service.js';
import {
  slugify,
  type CreateOrganizationDto,
  type UpdateOrganizationDto,
} from './organizations.schemas.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The creator becomes the first OWNER, in the same transaction. */
  async create(userId: string, dto: CreateOrganizationDto) {
    const organizationId = randomUUID();
    const slug = dto.slug ?? `${slugify(dto.name) || 'org'}-${organizationId.slice(0, 6)}`;
    const scope = { organizationId, userId };

    return this.prisma.withTenant(scope, async (tx) => {
      const organization = await tx.organization.create({
        data: { id: organizationId, name: dto.name, slug, timezone: dto.timezone },
      });
      await tx.membership.create({ data: { organizationId, userId, role: 'OWNER' } });
      await this.audit.record(tx, scope, {
        action: 'organization.created',
        entityType: 'organization',
        entityId: organizationId,
        metadata: { name: dto.name, slug },
      });
      return { ...organization, role: 'OWNER' as const };
    });
  }

  listForUser(userId: string) {
    return this.prisma.withUser(userId, async (tx) => {
      const memberships = await tx.membership.findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { organization: { name: 'asc' } },
      });
      return memberships.map(({ organization, role }) => ({ ...organization, role }));
    });
  }

  get(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: tenant.organizationId },
      });
      return { ...organization, role: tenant.role };
    });
  }

  update(tenant: TenantContext, dto: UpdateOrganizationDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({
        where: { id: tenant.organizationId },
      });
      const organization = await tx.organization.update({
        where: { id: tenant.organizationId },
        data: dto,
      });
      await this.audit.record(tx, tenant, {
        action: 'organization.updated',
        entityType: 'organization',
        entityId: organization.id,
        metadata: {
          before: { name: before.name, timezone: before.timezone },
          after: { name: organization.name, timezone: organization.timezone },
        },
      });
      return { ...organization, role: tenant.role };
    });
  }
}
