import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import { AuditService } from './audit.service.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
});

@Controller('organizations/:organizationId/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:view')
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>,
  ) {
    return this.audit.list(tenant, query);
  }
}
