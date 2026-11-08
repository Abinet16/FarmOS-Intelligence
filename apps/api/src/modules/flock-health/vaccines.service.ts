import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { AuditService } from '../audit/audit.service.js';
import type { UpdateVaccineDto, VaccineDto } from './flock-health.schemas.js';

/** The organization's vaccine list, with optional booster intervals. */
@Injectable()
export class VaccinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenant: TenantContext) {
    return this.prisma.withTenant(tenant, (tx) =>
      tx.vaccine.findMany({
        where: { organizationId: tenant.organizationId },
        orderBy: { name: 'asc' },
      }),
    );
  }

  create(tenant: TenantContext, dto: VaccineDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const vaccine = await tx.vaccine.create({
        data: { organizationId: tenant.organizationId, ...dto },
      });
      await this.audit.record(tx, tenant, {
        action: 'vaccine.created',
        entityType: 'vaccine',
        entityId: vaccine.id,
        metadata: dto,
      });
      return vaccine;
    });
  }

  update(tenant: TenantContext, vaccineId: string, dto: UpdateVaccineDto) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const before = await tx.vaccine.findFirst({
        where: { id: vaccineId, organizationId: tenant.organizationId },
      });
      if (!before) throw new NotFoundException('Vaccine not found');

      const vaccine = await tx.vaccine.update({ where: { id: vaccineId }, data: dto });
      await this.audit.record(tx, tenant, {
        action: 'vaccine.updated',
        entityType: 'vaccine',
        entityId: vaccineId,
        metadata: {
          before: { name: before.name, recommendedIntervalDays: before.recommendedIntervalDays },
          after: { name: vaccine.name, recommendedIntervalDays: vaccine.recommendedIntervalDays },
        },
      });
      return vaccine;
    });
  }
}
