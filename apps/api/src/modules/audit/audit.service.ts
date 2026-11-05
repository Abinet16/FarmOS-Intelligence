import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit entry inside the caller's transaction, so the entry
   * commits or rolls back together with the change it describes.
   */
  record(tx: Tx, tenant: Pick<TenantContext, 'organizationId' | 'userId'>, entry: AuditEntry) {
    return tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
      },
    });
  }

  /** Newest first, keyset-paginated on (created_at, id). */
  list(tenant: TenantContext, options: { limit: number; before?: string }) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const cursor = options.before
        ? await tx.auditLog.findFirst({
            where: { id: options.before, organizationId: tenant.organizationId },
            select: { createdAt: true, id: true },
          })
        : null;
      const items = await tx.auditLog.findMany({
        where: {
          organizationId: tenant.organizationId,
          ...(cursor && {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: options.limit + 1,
        include: { actor: { select: { id: true, name: true, email: true } } },
      });
      const hasMore = items.length > options.limit;
      const page = hasMore ? items.slice(0, options.limit) : items;
      return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id : null };
    });
  }
}
