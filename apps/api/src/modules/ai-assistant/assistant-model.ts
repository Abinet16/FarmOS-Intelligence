import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../../config/env.js';

export type ModelMessage = Anthropic.Beta.BetaMessageParam;
export type ModelTool = Anthropic.Beta.BetaTool;
export type ModelResponse = Anthropic.Beta.BetaMessage;

export interface ModelRequest {
  system: string;
  tools: ModelTool[];
  messages: ModelMessage[];
}

/**
 * The language model behind the assistant. Production uses Claude; tests
 * inject a scripted model so the tool loop, grounding checks and tenant
 * scoping can be verified without network calls.
 */
export interface AssistantModel {
  readonly provider: string;
  readonly model: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export const ASSISTANT_MODEL = Symbol('ASSISTANT_MODEL');

/**
 * Claude with adaptive thinking at medium effort: enough to plan a few tool
 * calls and compare their results. The system prompt and tools never change
 * between requests, so they are cached. If a safety classifier declines a
 * request, the server-side fallback retries it on the default fallback model.
 */
export class ClaudeAssistantModel implements AssistantModel {
  readonly provider = 'anthropic';

  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  complete({ system, tools, messages }: ModelRequest): Promise<ModelResponse> {
    return this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16_000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  }
}

/** Null when no API key is configured: the assistant then reports itself unavailable. */
export function createAssistantModel(env: Env): AssistantModel | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new ClaudeAssistantModel(
    new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 }),
    env.AI_MODEL,
  );
}
