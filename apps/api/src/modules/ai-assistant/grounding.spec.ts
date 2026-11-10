import type { AssistantAnswer } from '@farmos/shared-types';
import { figuresIn, groundingProblems, matches, numbersIn } from './grounding.js';

const answer = (overrides: Partial<AssistantAnswer>): AssistantAnswer => ({
  status: 'ANSWERED',
  answer: '',
  claims: [],
  dataGaps: [],
  suggestedChecks: [],
  ...overrides,
});

const evidence = new Map<string, unknown>([
  ['E1', { flocks: [{ batchCode: 'LAY-01', kpis: { mortalityPct: 1.0240797 }, feedKg: 1234.6 }] }],
  ['E2', { overview: { liveBirds: 4756, henDayPct: 86.0612 } }],
]);
const turn = { data: evidence, question: 'Which flock had the highest mortality over the last 7 days?' };

describe('figuresIn', () => {
  it('reads plain, grouped and decimal figures', () => {
    expect(figuresIn('4,756 birds at 86.06% and 1.5 kg')).toEqual([
      { value: 4756, decimals: 0 },
      { value: 86.06, decimals: 2 },
      { value: 1.5, decimals: 1 },
    ]);
  });

  it('ignores dates and identifiers', () => {
    expect(figuresIn('LAY-01 in house H2 on 2026-11-03 (E1), Nov 3–9 and 4 November 2026')).toEqual(
      [],
    );
  });
});

describe('numbersIn', () => {
  it('collects numbers from nested results, skipping other values', () => {
    expect(numbersIn({ a: 1, b: [2, { c: 3 }], d: 'x', e: null, f: Number.NaN })).toEqual([1, 2, 3]);
  });
});

describe('matches', () => {
  it('compares at the precision the figure was stated with', () => {
    expect(matches({ value: 1.02, decimals: 2 }, 1.0240797)).toBe(true);
    expect(matches({ value: 1235, decimals: 0 }, 1234.6)).toBe(true);
    expect(matches({ value: 1.03, decimals: 2 }, 1.0240797)).toBe(false);
  });
});

describe('groundingProblems', () => {
  it('accepts figures found in the cited evidence', () => {
    const reply = answer({
      answer: 'LAY-01 lost 1.02% of its birds and ate 1,235 kg of feed.',
      claims: [{ statement: 'LAY-01 mortality was 1.02% over 7 days', evidence: ['E1'] }],
    });
    expect(groundingProblems(reply, turn)).toEqual([]);
  });

  it('rejects a figure that its cited evidence lacks, even if other evidence has it', () => {
    const reply = answer({
      answer: 'There are 4,756 live birds.',
      claims: [{ statement: 'There are 4,756 live birds', evidence: ['E1'] }],
    });
    expect(groundingProblems(reply, turn)).toEqual([
      'Claim 1 ("There are 4,756 live birds") states 4756, which its cited evidence does not contain.',
    ]);
  });

  it('rejects invented figures in the answer text', () => {
    const reply = answer({
      answer: 'Mortality was 2.5%.',
      claims: [{ statement: 'Mortality was 1.02%', evidence: ['E1'] }],
    });
    expect(groundingProblems(reply, turn)).toEqual([
      'The answer states 2.5, which no tool result contains.',
    ]);
  });

  it('rejects claims without evidence or with unknown evidence', () => {
    const reply = answer({
      claims: [
        { statement: 'Flocks are healthy', evidence: [] },
        { statement: 'Hen-day was 86.06%', evidence: ['E9'] },
      ],
    });
    expect(groundingProblems(reply, turn)).toEqual([
      'Claim 1 ("Flocks are healthy") cites no evidence.',
      'Claim 2 ("Hen-day was 86.06%") cites unknown evidence E9.',
    ]);
  });

  it('requires a claim for an answered question but not for an abstention', () => {
    expect(groundingProblems(answer({ answer: 'Yes.' }), turn)).toHaveLength(1);
    expect(
      groundingProblems(
        answer({ status: 'INSUFFICIENT_DATA', answer: 'No feed was recorded.' }),
        turn,
      ),
    ).toEqual([]);
  });

  it('lets the answer repeat figures from the question', () => {
    const reply = answer({
      status: 'INSUFFICIENT_DATA',
      answer: 'Nothing was recorded in the last 7 days.',
    });
    expect(groundingProblems(reply, turn)).toEqual([]);
  });
});
