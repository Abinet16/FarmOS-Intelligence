import type Anthropic from '@anthropic-ai/sdk';
import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { AssistantAnswer, Evidence } from '@farmos/shared-types';
import type { z } from 'zod';
import type { TenantContext } from '../../common/request.js';
import { answerSchema, SUBMIT_ANSWER, submitAnswerDefinition } from './answer-schema.js';
import type { AssistantModel, ModelMessage, ModelResponse } from './assistant-model.js';
import {
  toolDefinitions,
  ToolInputError,
  toolsFor,
  type ToolOutput,
  type ToolServices,
} from './assistant-tools.js';
import { groundingProblems } from './grounding.js';
import { SUBMIT_REMINDER, SYSTEM_PROMPT } from './system-prompt.js';

/** Model requests per question: room for several tool rounds and a correction or two. */
export const MAX_ITERATIONS = 10;
/** Tool calls per question, so a confused model can't hammer the database. */
export const MAX_TOOL_CALLS = 20;

export interface ToolCallLog {
  tool: string;
  input: unknown;
  evidenceId: string | null;
  error: string | null;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface TurnResult {
  answer: AssistantAnswer;
  evidence: Evidence[];
  toolCalls: ToolCallLog[];
  model: {
    provider: string;
    requested: string;
    /** The model that produced the final response (differs after a safety fallback). */
    servedBy: string;
    iterations: number;
    usage: TurnUsage;
  };
}

/** The turn couldn't produce a grounded answer; nothing is shown to the user. */
export class AssistantFailedError extends Error {}

const DECLINED: AssistantAnswer = {
  status: 'OUT_OF_SCOPE',
  answer: "I can't help with that request. I can answer questions about your farm records.",
  claims: [],
  dataGaps: [],
  suggestedChecks: [],
};

type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

function errorResult(toolUseId: string, message: string): ToolResult {
  return { type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: message };
}

function describeIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
    .join('; ');
}

/** A tool's failure in words the model can act on, without internal details. */
function describeToolError(error: unknown): string | null {
  if (error instanceof NotFoundException) return 'Not found in this organization.';
  if (error instanceof ToolInputError) return `Invalid input: ${error.message}`;
  if (error instanceof HttpException && error.getStatus() < 500) {
    const body = error.getResponse() as { issues?: { path: string; message: string }[] };
    const issues = body.issues?.map((i) => `${i.path}: ${i.message}`).join('; ');
    return `Invalid input: ${issues ?? error.message}`;
  }
  return null;
}

export interface TurnOptions {
  model: AssistantModel;
  services: ToolServices;
  tenant: TenantContext;
  /** Earlier questions and answers in the conversation, as plain text. */
  history: ModelMessage[];
  question: string;
  /** The organization's today, YYYY-MM-DD, so "last week" means the right days. */
  today: string;
}

/**
 * One question, answered: the model calls read-only tools (validated, run
 * with the caller's organization and permissions), then submits an answer
 * that must cite this turn's evidence. Answers whose citations or figures
 * don't check out are sent back for correction, never to the user.
 */
export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  const { model, services, tenant, question } = options;
  const logger = new Logger('Assistant');
  const tools = toolsFor(tenant);
  const toolByName = new Map(tools.map((t) => [t.name as string, t]));
  const definitions = [...toolDefinitions(tools), submitAnswerDefinition];

  const messages: ModelMessage[] = [
    ...options.history,
    {
      role: 'user',
      content: [
        { type: 'text', text: `Today's date for this organization: ${options.today}` },
        { type: 'text', text: question },
      ],
    },
  ];
  const evidence: Evidence[] = [];
  const evidenceData = new Map<string, unknown>();
  const toolCalls: ToolCallLog[] = [];
  const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let reminded = false;

  const finish = (answer: AssistantAnswer, response: ModelResponse, iterations: number) => ({
    answer,
    evidence,
    toolCalls,
    model: {
      provider: model.provider,
      requested: model.model,
      servedBy: response.model,
      iterations,
      usage,
    },
  });

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const response = await model.complete({ system: SYSTEM_PROMPT, tools: definitions, messages });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

    // A declined request may stop mid tool call; none of its tools run.
    if (response.stop_reason === 'refusal') return finish(DECLINED, response, iteration);
    if (response.stop_reason === 'max_tokens') {
      throw new AssistantFailedError('The response was cut off before it finished');
    }

    messages.push({ role: 'assistant', content: response.content });
    const calls = response.content.filter((block) => block.type === 'tool_use');

    if (calls.length === 0) {
      if (reminded) throw new AssistantFailedError('The model did not submit an answer');
      reminded = true;
      messages.push({ role: 'user', content: SUBMIT_REMINDER });
      continue;
    }

    const results: ToolResult[] = [];
    let accepted: AssistantAnswer | null = null;

    for (const call of calls) {
      if (call.name === SUBMIT_ANSWER) {
        const parsed = answerSchema.safeParse(call.input);
        if (!parsed.success) {
          results.push(errorResult(call.id, `Invalid answer: ${describeIssues(parsed.error)}`));
          continue;
        }
        const problems = groundingProblems(parsed.data, { data: evidenceData, question });
        if (problems.length > 0) {
          results.push(errorResult(call.id, `Fix these problems:\n- ${problems.join('\n- ')}`));
          continue;
        }
        accepted = parsed.data;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Answer accepted.' });
        continue;
      }

      const log: ToolCallLog = {
        tool: call.name,
        input: call.input,
        evidenceId: null,
        error: null,
      };
      toolCalls.push(log);
      const tool = toolByName.get(call.name);
      if (!tool) {
        log.error = 'unknown tool';
        results.push(errorResult(call.id, `Unknown tool ${call.name}.`));
        continue;
      }
      if (toolCalls.length > MAX_TOOL_CALLS) {
        log.error = 'tool call limit';
        results.push(errorResult(call.id, 'Tool call limit reached; answer with what you have.'));
        continue;
      }
      const input = tool.input.safeParse(call.input);
      if (!input.success) {
        log.error = describeIssues(input.error);
        results.push(errorResult(call.id, `Invalid input: ${log.error}`));
        continue;
      }
      log.input = input.data;

      let output: ToolOutput;
      try {
        // The tenant comes from the signed-in request, never from the model.
        output = await tool.run(services, tenant, input.data as never);
      } catch (error) {
        const message = describeToolError(error);
        if (message === null) {
          logger.error(`Tool ${call.name} failed`, error instanceof Error ? error.stack : error);
        }
        log.error = message ?? 'tool failed';
        results.push(errorResult(call.id, message ?? 'The tool failed; try again later.'));
        continue;
      }

      const id = `E${evidence.length + 1}`;
      log.evidenceId = id;
      evidence.push({
        id,
        tool: call.name,
        input: input.data,
        summary: output.summary,
        records: output.records,
      });
      evidenceData.set(id, output.data);
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify({ evidenceId: id, data: output.data }),
      });
    }

    if (accepted) return finish(accepted, response, iteration);
    messages.push({ role: 'user', content: results });
  }
  throw new AssistantFailedError(`No grounded answer after ${MAX_ITERATIONS} model requests`);
}
