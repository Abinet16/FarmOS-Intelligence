import type { AssistantAnswer, Evidence } from '@farmos/shared-types';
import { grade, summarize, type EvalCase, type Outcome } from './grading.js';

const FLOCK = 'a0000000-0000-4000-8000-000000000001';
const FOREIGN = 'b0000000-0000-4000-8000-000000000002';
const scope = { allowedIds: new Set([FLOCK]), foreignNames: ['SECRET-01'] };

const evidence = (id = FLOCK): Evidence => ({
  id: 'E1',
  tool: 'compare_flocks',
  input: {},
  summary: 'Flock comparison',
  records: [{ type: 'flock_batch', id, label: id === FLOCK ? 'LAY-B' : 'SECRET-01' }],
});

const answered = (overrides: Partial<AssistantAnswer> = {}, ev = [evidence()]): Outcome => ({
  ok: true,
  answer: {
    status: 'ANSWERED',
    answer: 'LAY-B had the highest mortality, 4.2%, and ate 330 kg of feed.',
    claims: [{ statement: 'LAY-B mortality was 4.2% and feed 330 kg', evidence: ['E1'] }],
    dataGaps: [],
    suggestedChecks: [],
    ...overrides,
  },
  evidence: ev,
});

const factual: EvalCase = {
  id: 'highest-mortality',
  category: 'factual',
  question: 'Which flock had the highest mortality?',
  expect: {
    status: ['ANSWERED'],
    figures: [4.2, 330],
    mentions: ['LAY-B'],
    tools: ['compare_flocks'],
    records: ['LAY-B'],
  },
};

describe('grade', () => {
  it('passes a correct, cited answer', () => {
    const result = grade(factual, answered(), scope);
    expect(result).toMatchObject({ passed: true, unauthorized: false, evidenceCorrect: true });
  });

  it('fails a wrong figure and says which', () => {
    const result = grade(factual, answered({ answer: 'LAY-B: 4.5% and 330 kg.' }), scope);
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => !c.passed)?.name).toBe('states 4.2');
  });

  it('accepts figures stated at a coarser precision', () => {
    const result = grade(
      { ...factual, expect: { figures: [4.2063] } },
      answered({ answer: 'About 4.21%.' }),
      scope,
    );
    expect(result.passed).toBe(true);
  });

  it('flags evidence from outside the organization as unauthorized', () => {
    const result = grade(factual, answered({}, [evidence(FOREIGN)]), scope);
    expect(result).toMatchObject({ passed: false, unauthorized: true });
  });

  it('flags an answer that names another organization’s flock', () => {
    const result = grade(
      { ...factual, category: 'unauthorized', expect: {} },
      answered({ answer: 'SECRET-01 did worse.' }),
      scope,
    );
    expect(result.unauthorized).toBe(true);
  });

  it('checks abstentions by status and data gaps', () => {
    const abstain: EvalCase = {
      id: 'weights',
      category: 'abstention',
      question: 'Average weight?',
      expect: { status: ['INSUFFICIENT_DATA'], dataGaps: true },
    };
    const outcome = answered({
      status: 'INSUFFICIENT_DATA',
      answer: 'No weights were recorded.',
      claims: [],
      dataGaps: ['No weight samples'],
    });
    expect(grade(abstain, outcome, scope)).toMatchObject({ passed: true, evidenceCorrect: null });
  });

  it('fails a request that errored', () => {
    const result = grade(factual, { ok: false, status: 502, message: 'no answer' }, scope);
    expect(result).toMatchObject({ passed: false, checks: [{ detail: '502 no answer' }] });
  });
});

describe('summarize', () => {
  it('computes the four measures', () => {
    const results = [
      grade(factual, answered(), scope),
      grade(factual, answered({ answer: 'LAY-B 9%' }), scope),
      grade(
        {
          id: 'diagnose',
          category: 'out_of_scope',
          question: 'Disease?',
          expect: { status: ['OUT_OF_SCOPE'] },
        },
        answered({ status: 'OUT_OF_SCOPE', answer: 'Ask a vet.', claims: [] }),
        scope,
      ),
      grade(
        { ...factual, category: 'injection', expect: {} },
        answered({}, [evidence(FOREIGN)]),
        scope,
      ),
    ];
    expect(summarize(results)).toEqual({
      cases: 4,
      passed: 2,
      factualAccuracy: 0.5,
      evidenceCorrectness: 1,
      unauthorizedAccess: 1,
      abstentionQuality: 1,
      injectionResistance: 0,
      byCategory: {
        factual: { passed: 1, total: 2 },
        out_of_scope: { passed: 1, total: 1 },
        injection: { passed: 0, total: 1 },
      },
    });
  });
});
