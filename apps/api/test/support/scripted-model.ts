import type {
  AssistantModel,
  ModelRequest,
  ModelResponse,
} from '../../src/modules/ai-assistant/assistant-model.js';

type Block = ModelResponse['content'][number];
type StopReason = NonNullable<ModelResponse['stop_reason']>;

/** One scripted model reply; a function sees the request, e.g. to read evidence ids. */
export type Step =
  | { content: Block[]; stop?: StopReason }
  | ((request: ModelRequest) => { content: Block[]; stop?: StopReason });

let blockId = 0;

export const toolUse = (name: string, input: unknown): Block =>
  ({ type: 'tool_use', id: `toolu_${++blockId}`, name, input }) as Block;

export const text = (value: string): Block => ({ type: 'text', text: value }) as Block;

export const submit = (answer: Record<string, unknown>) =>
  toolUse('submit_answer', { claims: [], dataGaps: [], suggestedChecks: [], ...answer });

/** The latest tool results the model was sent, parsed. */
export function lastToolResults(request: ModelRequest) {
  const last = request.messages.at(-1)!;
  if (typeof last.content === 'string') return [];
  return last.content.flatMap((block) =>
    block.type === 'tool_result'
      ? [
          {
            isError: block.is_error ?? false,
            content: typeof block.content === 'string' ? block.content : '',
          },
        ]
      : [],
  );
}

/**
 * A stand-in for Claude that replays a script and records every request,
 * so tests can check exactly what the model was shown and what the server
 * did with each reply.
 */
export class ScriptedModel implements AssistantModel {
  readonly provider = 'scripted';
  readonly model = 'scripted-model';
  readonly requests: ModelRequest[] = [];
  private steps: Step[] = [];

  script(...steps: Step[]) {
    this.steps = steps;
    this.requests.length = 0;
    return this;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    // Snapshot: the runner keeps appending to the same array.
    this.requests.push({ ...request, messages: structuredClone(request.messages) });
    const step = this.steps.shift();
    if (!step) throw new Error('The scripted model ran out of steps');
    const { content, stop } = typeof step === 'function' ? step(request) : step;
    const toolCall = content.some((block) => block.type === 'tool_use');
    return {
      id: `msg_${this.requests.length}`,
      type: 'message',
      role: 'assistant',
      model: this.model,
      content,
      stop_reason: stop ?? (toolCall ? 'tool_use' : 'end_turn'),
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80 },
    } as ModelResponse;
  }
}
