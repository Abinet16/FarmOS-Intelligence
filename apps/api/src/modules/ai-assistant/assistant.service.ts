import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AssistantAnswer, Evidence } from '@farmos/shared-types';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TenantContext } from '../../common/request.js';
import { pageArgs, toPage } from '../../common/query/pagination.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { organizationToday } from '../../database/organization-today.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AuditService } from '../audit/audit.service.js';
import { dateKey } from '../metrics/flock-metrics.js';
import { ASSISTANT_MODEL, type AssistantModel, type ModelMessage } from './assistant-model.js';
import {
  AssistantFailedError,
  runTurn,
  type ToolCallLog,
  type TurnResult,
} from './assistant-runner.js';
import type { AskDto, ListConversationsQuery } from './assistant.schemas.js';

const DAY_MS = 86_400_000;
/** Earlier exchanges sent back to the model as context. */
const HISTORY_EXCHANGES = 10;
const TITLE_LENGTH = 120;

/**
 * Stored with each answer: what it claimed, the evidence it cited and how it
 * was produced. Tool results themselves are not stored; the evidence records
 * which query ran with which arguments, so it can be re-run and checked.
 */
interface AnswerMetadata {
  answer: Omit<AssistantAnswer, 'answer'>;
  evidence: Evidence[];
  toolCalls: ToolCallLog[];
  model: TurnResult['model'];
}

const messageSelect = {
  id: true,
  role: true,
  content: true,
  evidenceMetadata: true,
  createdAt: true,
} as const satisfies Prisma.AiMessageSelect;

type MessageRow = Prisma.AiMessageGetPayload<{ select: typeof messageSelect }>;

function present(message: MessageRow) {
  const metadata = message.evidenceMetadata as AnswerMetadata | null;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(metadata && {
      answer: { ...metadata.answer, answer: message.content },
      evidence: metadata.evidence,
    }),
  };
}

/**
 * Conversations with the assistant. Each one belongs to the member who
 * started it: other members of the organization, owners included, can't
 * read it. Questions are rate limited per member and every answer is audited.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    @Inject(ASSISTANT_MODEL) private readonly model: AssistantModel | null,
    @Inject(ENV) private readonly env: Env,
  ) {}

  status() {
    return {
      available: this.model !== null,
      model: this.model?.model ?? null,
      dailyQuestionLimit: this.env.AI_DAILY_QUESTION_LIMIT,
    };
  }

  list(tenant: TenantContext, query: ListConversationsQuery) {
    const where = { organizationId: tenant.organizationId, userId: tenant.userId };
    return this.prisma.withTenant(tenant, async (tx) => {
      const [items, total] = await Promise.all([
        tx.aiConversation.findMany({
          where,
          select: { id: true, title: true, createdAt: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          ...pageArgs(query),
        }),
        tx.aiConversation.count({ where }),
      ]);
      return toPage(items, total, query);
    });
  }

  get(tenant: TenantContext, conversationId: string) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const conversation = await this.ownConversation(tx, tenant, conversationId);
      const messages = await tx.aiMessage.findMany({
        where: { organizationId: tenant.organizationId, conversationId, role: { not: 'TOOL' } },
        select: messageSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return { ...conversation, messages: messages.map(present) };
    });
  }

  /**
   * Stores the question, runs the model outside any transaction (it takes
   * seconds), then stores the answer with its evidence and an audit entry.
   * A failed turn leaves the question without an answer, so it can be asked again.
   */
  async ask(tenant: TenantContext, conversationId: string | null, dto: AskDto) {
    const model = this.model;
    if (!model) throw new ServiceUnavailableException('The assistant is not configured');

    const { conversation, question, history, today } = await this.prisma.withTenant(
      tenant,
      async (tx) => {
        await this.assertWithinLimit(tx, tenant);
        const existing = conversationId
          ? await this.ownConversation(tx, tenant, conversationId)
          : null;
        const history = existing ? await this.history(tx, tenant, existing.id) : [];
        const conversation =
          existing ??
          (await tx.aiConversation.create({
            data: {
              organizationId: tenant.organizationId,
              userId: tenant.userId,
              title: dto.question.slice(0, TITLE_LENGTH),
            },
            select: { id: true, title: true, createdAt: true, updatedAt: true },
          }));
        const question = await tx.aiMessage.create({
          data: {
            organizationId: tenant.organizationId,
            conversationId: conversation.id,
            role: 'USER',
            content: dto.question,
          },
          select: messageSelect,
        });
        const today = dateKey(await organizationToday(tx, tenant.organizationId));
        return { conversation, question, history, today };
      },
    );

    const turn = await this.runTurn(model, tenant, history, dto.question, today);

    const answer = await this.prisma.withTenant(tenant, async (tx) => {
      const { answer: text, ...rest } = turn.answer;
      const metadata: AnswerMetadata = {
        answer: rest,
        evidence: turn.evidence,
        toolCalls: turn.toolCalls,
        model: turn.model,
      };
      const message = await tx.aiMessage.create({
        data: {
          organizationId: tenant.organizationId,
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: text,
          evidenceMetadata: metadata as unknown as Prisma.InputJsonValue,
        },
        select: messageSelect,
      });
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      await this.audit.record(tx, tenant, {
        action: 'assistant.answered',
        entityType: 'ai_conversation',
        entityId: conversation.id,
        metadata: {
          messageId: message.id,
          status: turn.answer.status,
          tools: turn.toolCalls.map((call) => call.tool),
          rejectedToolCalls: turn.toolCalls.filter((call) => call.error).length,
          evidence: turn.evidence.length,
          model: turn.model.servedBy,
        },
      });
      return message;
    });

    return { conversation, messages: [present(question), present(answer)] };
  }

  private async runTurn(
    model: AssistantModel,
    tenant: TenantContext,
    history: ModelMessage[],
    question: string,
    today: string,
  ) {
    try {
      return await runTurn({
        model,
        services: { prisma: this.prisma, analytics: this.analytics, alerts: this.alerts },
        tenant,
        history,
        question,
        today,
      });
    } catch (error) {
      if (error instanceof AssistantFailedError) {
        this.logger.warn(`No grounded answer: ${error.message}`);
        throw new BadGatewayException('The assistant could not answer that. Please try again.');
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Model request failed (${error.status}): ${error.message}`);
        throw new ServiceUnavailableException('The assistant is unavailable. Please try again.');
      }
      throw error;
    }
  }

  private async ownConversation(tx: Tx, tenant: TenantContext, conversationId: string) {
    const conversation = await tx.aiConversation.findFirst({
      where: { id: conversationId, organizationId: tenant.organizationId, userId: tenant.userId },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  /** Earlier questions and answers as plain text: no tool data is replayed. */
  private async history(tx: Tx, tenant: TenantContext, conversationId: string) {
    const recent = await tx.aiMessage.findMany({
      where: {
        organizationId: tenant.organizationId,
        conversationId,
        role: { in: ['USER', 'ASSISTANT'] },
      },
      select: { role: true, content: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_EXCHANGES * 2,
    });
    const messages: ModelMessage[] = recent.reverse().map((message) => ({
      role: message.role === 'USER' ? 'user' : 'assistant',
      content: message.content,
    }));
    // The conversation must start with a question; an unanswered question
    // (a failed turn) is dropped so roles keep alternating.
    return messages.filter(
      (message, index) =>
        !(message.role === 'user' && messages[index + 1]?.role !== 'assistant') &&
        !(index === 0 && message.role === 'assistant'),
    );
  }

  /** Questions in the last 24 hours, by this member, in this organization. */
  private async assertWithinLimit(tx: Tx, tenant: TenantContext) {
    const asked = await tx.aiMessage.count({
      where: {
        organizationId: tenant.organizationId,
        role: 'USER',
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
        conversation: { userId: tenant.userId },
      },
    });
    if (asked >= this.env.AI_DAILY_QUESTION_LIMIT) {
      throw new HttpException(
        `You can ask ${this.env.AI_DAILY_QUESTION_LIMIT} questions a day. Please try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
