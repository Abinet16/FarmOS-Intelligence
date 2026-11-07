import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { AuditService } from '../audit/audit.service.js';
import type { FeedTypeDto } from './feed-types.schemas.js';

/** Feed types are a short per-organization list (starter, grower, layer mash…). */
@Injectable()
export class FeedTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, (tx) =>
      tx.feedType.findMany({
        where: { organizationId: tenant.organizationId },
        orderBy: { name: 'asc' },
      }),
    );
  }

  create(tenant: TenantContext, dto: FeedTypeDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const feedType = await tx.feedType.create({
        data: { organizationId: tenant.organizationId, name: dto.name },
      });
      await this.audit.record(tx, tenant, {
        action: 'feed_type.created',
        entityType: 'feed_type',
        entityId: feedType.id,
        metadata: { name: dto.name },
      });
      return feedType;
    });
  }

  rename(tenant: TenantContext, feedTypeId: string, dto: FeedTypeDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await tx.feedType.findFirst({
        where: { id: feedTypeId, organizationId: tenant.organizationId },
      });
      if (!before) throw new NotFoundException('Feed type not found');

      const feedType = await tx.feedType.update({
        where: { id: feedTypeId },
        data: { name: dto.name },
      });
      await this.audit.record(tx, tenant, {
        action: 'feed_type.renamed',
        entityType: 'feed_type',
        entityId: feedTypeId,
        metadata: { from: before.name, to: dto.name },
      });
      return feedType;
    });
  }
}
