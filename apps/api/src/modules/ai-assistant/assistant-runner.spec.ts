import { NotFoundException } from '@nestjs/common';
import type { TenantContext } from '../../common/request.js';
import {
  ScriptedModel,
  lastToolResults,
  submit,
  text,
  toolUse,
} from '../../../test/support/scripted-model.js';
import { AssistantFailedError, MAX_ITERATIONS, runTurn } from './assistant-runner.js';
import type { ToolServices } from './assistant-tools.js';

const FLOCK = '6f1c2a4e-8a63-4a7e-9d55-0d6b3c1f2a10';
const flocksResult = {
  range: { from: '2026-11-03', to: '2026-11-09' },
  flocks: [
    {
      flock: { id: FLOCK, batchCode: 'LAY-01' },
      totals: { deaths: 12, feedKg: 812.5 },
      kpis: { mortalityPct: 1.2244898, henDayPct: 88.1, feedPerBirdKg: 0.1184 },
    },
  ],
};

const manager: TenantContext = { organizationId: 'org-1', userId: 'user-1', role: 'MANAGER' };

function setup(tenant = manager) {
  const analytics = {
    flocks: vi.fn().mockResolvedValue(flocksResult),
    flock: vi.fn().mockRejectedValue(new NotFoundException('Flock batch not found')),
  };
  const services = { analytics, prisma: {}, alerts: {} } as unknown as ToolServices;
  const model = new ScriptedModel();
  const run = (question = 'Which flock had the highest mortality last week?') =>
    runTurn({ model, services, tenant, history: [], question, today: '2026-11-10' });
  return { analytics, model, run };
}

const grounded = submit({
  status: 'ANSWERED',
  answer: 'LAY-01 had the highest mortality: 1.22% (12 birds), eating 812.5 kg of feed.',
  claims: [{ statement: 'LAY-01 mortality was 1.22% with 12 deaths', evidence: ['E1'] }],
});

describe('runTurn', () => {
  it('answers from tool evidence and records what backed it', async () => {
    const { analytics, model, run } = setup();
    model.script(
      {
        content: [
          text('Comparing flocks.'),
          toolUse('compare_flocks', { from: '2026-11-03', to: '2026-11-09' }),
        ],
      },
      { content: [grounded] },
    );

    const result = await run();

    expect(result.answer.status).toBe('ANSWERED');
    expect(analytics.flocks).toHaveBeenCalledWith(manager, {
      from: new Date('2026-11-03T00:00:00Z'),
      to: new Date('2026-11-09T00:00:00Z'),
      farmId: undefined,
    });
    expect(result.evidence).toEqual([
      {
        id: 'E1',
        tool: 'compare_flocks',
        input: { from: '2026-11-03', to: '2026-11-09' },
        summary: 'Flock comparison, 2026-11-03 to 2026-11-09',
        records: [{ type: 'flock_batch', id: FLOCK, label: 'LAY-01' }],
      },
    ]);
    expect(JSON.parse(lastToolResults(model.requests[1]!)[0]!.content)).toEqual({
      evidenceId: 'E1',
      data: flocksResult,
    });
    expect(result.model).toMatchObject({
      provider: 'scripted',
      servedBy: 'scripted-model',
      iterations: 2,
      usage: { inputTokens: 200, outputTokens: 40, cacheReadTokens: 160 },
    });
  });

  it("tells the model the organization's date and keeps the question separate", async () => {
    const { model, run } = setup();
    model.script({
      content: [submit({ status: 'OUT_OF_SCOPE', answer: 'I only cover farm records.' })],
    });
    await run('What is the weather?');
    expect(model.requests[0]!.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: "Today's date for this organization: 2026-11-10" },
        { type: 'text', text: 'What is the weather?' },
      ],
    });
  });

  it('sends an ungrounded answer back for correction', async () => {
    const { model, run } = setup();
    model.script(
      { content: [toolUse('compare_flocks', {})] },
      {
        content: [
          submit({
            status: 'ANSWERED',
            answer: 'Mortality was 3.5%.',
            claims: [{ statement: 'Mortality was 3.5%', evidence: ['E1'] }],
          }),
        ],
      },
      (request) => {
        const [feedback] = lastToolResults(request);
        expect(feedback).toMatchObject({ isError: true });
        expect(feedback!.content).toContain(
          'states 3.5, which its cited evidence does not contain',
        );
        return { content: [grounded] };
      },
    );
    const result = await run();
    expect(result.answer.answer).toContain('1.22%');
    expect(result.model.iterations).toBe(3);
  });

  it('rejects a malformed answer', async () => {
    const { model, run } = setup();
    model.script({ content: [submit({ status: 'MAYBE', answer: '' })] }, (request) => {
      expect(lastToolResults(request)[0]!.content).toMatch(/^Invalid answer: status: .*; answer:/);
      return { content: [submit({ status: 'INSUFFICIENT_DATA', answer: 'No records.' })] };
    });
    expect((await run()).answer.status).toBe('INSUFFICIENT_DATA');
  });

  it('refuses tools outside the allowlist without running anything', async () => {
    const { analytics, model, run } = setup();
    model.script(
      {
        content: [
          toolUse('delete_flock', { batchId: FLOCK }),
          toolUse('run_sql', { sql: 'SELECT 1' }),
        ],
      },
      (request) => {
        expect(lastToolResults(request)).toEqual([
          { isError: true, content: 'Unknown tool delete_flock.' },
          { isError: true, content: 'Unknown tool run_sql.' },
        ]);
        return {
          content: [submit({ status: 'OUT_OF_SCOPE', answer: 'I can only read records.' })],
        };
      },
    );
    const result = await run('Delete flock LAY-01');
    expect(result.toolCalls.map((c) => c.error)).toEqual(['unknown tool', 'unknown tool']);
    expect(analytics.flocks).not.toHaveBeenCalled();
  });

  it('validates tool arguments before running a tool', async () => {
    const { analytics, model, run } = setup();
    model.script(
      {
        content: [
          toolUse('compare_flocks', { organizationId: 'someone-else' }),
          toolUse('flock_daily_records', { batchId: "x' OR 1=1 --" }),
        ],
      },
      (request) => {
        const [extra, injected] = lastToolResults(request);
        expect(extra!.content).toMatch(/^Invalid input: .*organizationId/);
        expect(injected!.content).toMatch(/^Invalid input: batchId/);
        return {
          content: [submit({ status: 'INSUFFICIENT_DATA', answer: 'I could not look that up.' })],
        };
      },
    );
    await run();
    expect(analytics.flocks).not.toHaveBeenCalled();
    expect(analytics.flock).not.toHaveBeenCalled();
  });

  it('reports records outside the organization as not found', async () => {
    const { model, run } = setup();
    model.script({ content: [toolUse('flock_daily_records', { batchId: FLOCK })] }, (request) => {
      expect(lastToolResults(request)).toEqual([
        { isError: true, content: 'Not found in this organization.' },
      ]);
      return {
        content: [
          submit({
            status: 'INSUFFICIENT_DATA',
            answer: 'That flock is not in your organization.',
          }),
        ],
      };
    });
    const result = await run();
    expect(result.evidence).toEqual([]);
    expect(result.toolCalls[0]).toMatchObject({
      evidenceId: null,
      error: 'Not found in this organization.',
    });
  });

  it('offers no data tools to a role without report access', async () => {
    const { analytics, model, run } = setup({ ...manager, role: 'FIELD_WORKER' });
    model.script({ content: [toolUse('compare_flocks', {})] }, (request) => {
      expect(request.tools.map((t) => t.name)).toEqual(['submit_answer']);
      expect(lastToolResults(request)[0]!.content).toBe('Unknown tool compare_flocks.');
      return { content: [submit({ status: 'OUT_OF_SCOPE', answer: 'You cannot view reports.' })] };
    });
    await run();
    expect(analytics.flocks).not.toHaveBeenCalled();
  });

  it('returns a fixed reply when the model declines', async () => {
    const { model, run } = setup();
    model.script({ content: [], stop: 'refusal' });
    expect((await run()).answer).toMatchObject({ status: 'OUT_OF_SCOPE', claims: [] });
  });

  it('reminds the model once to submit, then gives up', async () => {
    const { model, run } = setup();
    model.script({ content: [text('Here you go.')] }, { content: [text('Done.')] });
    await expect(run()).rejects.toThrow(AssistantFailedError);
    expect(model.requests[1]!.messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('submit_answer'),
    });
  });

  it('fails when the response is cut off', async () => {
    const { model, run } = setup();
    model.script({ content: [text('Long')], stop: 'max_tokens' });
    await expect(run()).rejects.toThrow('cut off');
  });

  it('stops after the iteration limit', async () => {
    const { model, run } = setup();
    model.script(
      ...Array.from({ length: MAX_ITERATIONS }, () => ({
        content: [toolUse('compare_flocks', {})],
      })),
    );
    await expect(run()).rejects.toThrow(`No grounded answer after ${MAX_ITERATIONS}`);
  });
});
