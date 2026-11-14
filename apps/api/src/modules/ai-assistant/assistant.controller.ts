import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  askSchema,
  listConversationsSchema,
  type AskDto,
  type ListConversationsQuery,
} from './assistant.schemas.js';
import { AssistantService } from './assistant.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';

/**
 * The assistant needs `ai:query`. What it can look up is further limited to
 * the caller's own permissions, and conversations are private to their author.
 */
@Controller('organizations/:organizationId/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  @RequirePermission('ai:query')
  status() {
    return this.assistant.status();
  }

  @Get('conversations')
  @RequirePermission('ai:query')
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listConversationsSchema)) query: ListConversationsQuery,
  ) {
    return this.assistant.list(tenant, query);
  }

  @Post('conversations')
  @RequirePermission('ai:query')
  @RateLimit({ name: 'assistant', limit: 10, windowSeconds: 60 })
  start(@Tenant() tenant: TenantContext, @Body(new ZodValidationPipe(askSchema)) dto: AskDto) {
    return this.assistant.ask(tenant, null, dto);
  }

  @Get('conversations/:conversationId')
  @RequirePermission('ai:query')
  get(
    @Tenant() tenant: TenantContext,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.assistant.get(tenant, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermission('ai:query')
  @RateLimit({ name: 'assistant', limit: 10, windowSeconds: 60 })
  ask(
    @Tenant() tenant: TenantContext,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(askSchema)) dto: AskDto,
  ) {
    return this.assistant.ask(tenant, conversationId, dto);
  }
}
