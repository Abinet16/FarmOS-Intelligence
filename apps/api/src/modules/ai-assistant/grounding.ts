import type { AssistantAnswer } from '@farmos/shared-types';

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

/**
 * Text that looks numeric but isn't a figure: ISO dates, written dates
 * ("Nov 3", "3–9 November 2026"), and identifiers with letters and digits
 * (batch codes like LAY-01, house H2, evidence ids E1).
 */
const NOT_FIGURES = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:\\s*[–-]\\s*\\d{1,2})?(?:,?\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b\\d{1,2}(?:\\s*[–-]\\s*\\d{1,2})?\\s+${MONTH}(?:\\s+\\d{4})?`, 'gi'),
  /\b[A-Za-z]+[-_]?\d[\w-]*/g,
];

/** The figures a sentence states, as numbers ("1,234.5 kg" → 1234.5). */
export function figuresIn(text: string): { value: number; decimals: number }[] {
  let rest = text;
  for (const pattern of NOT_FIGURES) rest = rest.replace(pattern, ' ');
  return [...rest.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map(([raw]) => {
    const clean = raw.replace(/,/g, '');
    return { value: Number(clean), decimals: clean.split('.')[1]?.length ?? 0 };
  });
}

/** Every number anywhere in a tool result, however deeply nested. */
export function numbersIn(data: unknown, into: number[] = []): number[] {
  if (typeof data === 'number' && Number.isFinite(data)) into.push(data);
  else if (Array.isArray(data)) for (const item of data) numbersIn(item, into);
  else if (data && typeof data === 'object') {
    for (const value of Object.values(data)) numbersIn(value, into);
  }
  return into;
}

/**
 * A stated figure matches a source value when the source rounds to it at the
 * precision it was stated with: 1.02 matches 1.0241, 1,235 matches 1234.6.
 */
export function matches(stated: { value: number; decimals: number }, source: number): boolean {
  const scale = 10 ** stated.decimals;
  return Math.abs(Math.round(source * scale) / scale - stated.value) < 1e-9;
}

export interface TurnEvidence {
  /** Evidence id → the data the model saw. */
  data: ReadonlyMap<string, unknown>;
  /** Figures the user wrote, e.g. "last 7 days", which the answer may repeat. */
  question: string;
}

/**
 * Checks that an answer is backed by this turn's tool results. Returns the
 * problems found (empty when grounded). The assistant is asked to fix them
 * before anything reaches the user.
 */
export function groundingProblems(answer: AssistantAnswer, turn: TurnEvidence): string[] {
  const problems: string[] = [];
  const questionFigures = figuresIn(turn.question).map((f) => f.value);
  const allNumbers = [...turn.data.values()].flatMap((data) => numbersIn(data));

  const unsupported = (text: string, sources: number[]) =>
    figuresIn(text).filter(
      (figure) =>
        !questionFigures.includes(figure.value) &&
        !sources.some((source) => matches(figure, source)),
    );

  if (answer.status === 'ANSWERED' && answer.claims.length === 0) {
    problems.push('An ANSWERED reply needs at least one claim citing evidence.');
  }

  answer.claims.forEach((claim, index) => {
    const label = `Claim ${index + 1} ("${claim.statement}")`;
    if (claim.evidence.length === 0) {
      problems.push(`${label} cites no evidence.`);
      return;
    }
    const missing = claim.evidence.filter((id) => !turn.data.has(id));
    if (missing.length > 0) {
      problems.push(`${label} cites unknown evidence ${missing.join(', ')}.`);
      return;
    }
    const sources = claim.evidence.flatMap((id) => numbersIn(turn.data.get(id)));
    for (const figure of unsupported(claim.statement, sources)) {
      problems.push(`${label} states ${figure.value}, which its cited evidence does not contain.`);
    }
  });

  for (const figure of unsupported(answer.answer, allNumbers)) {
    problems.push(`The answer states ${figure.value}, which no tool result contains.`);
  }
  return problems;
}
