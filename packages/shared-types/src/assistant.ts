/**
 * How the assistant ended a turn. It answers only from evidence it retrieved;
 * otherwise it says the records are insufficient or the question is outside
 * what it may do (diagnosis, prescriptions, changing records).
 */
export const ANSWER_STATUSES = ['ANSWERED', 'INSUFFICIENT_DATA', 'OUT_OF_SCOPE'] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/** A record an answer relies on, so the UI can link to it. */
export interface RecordRef {
  type: 'flock_batch' | 'farm' | 'alert' | 'health_event' | 'vaccination' | 'inventory_item';
  id: string;
  label: string;
}

/** One tool call's result as the user sees it: what was asked, and of which records. */
export interface Evidence {
  id: string;
  tool: string;
  /** Validated arguments the tool ran with. */
  input: Record<string, unknown>;
  /** Plain-language description, e.g. "Flock performance, 2026-11-01 to 2026-11-07". */
  summary: string;
  records: RecordRef[];
}

export interface Claim {
  statement: string;
  /** Evidence ids (E1, E2…) that support the statement. */
  evidence: string[];
}

export interface AssistantAnswer {
  status: AnswerStatus;
  answer: string;
  claims: Claim[];
  /** Missing or conflicting records that limit the answer. */
  dataGaps: string[];
  /** Checks a person could make; never a diagnosis or a treatment. */
  suggestedChecks: string[];
}

export const MAX_QUESTION_LENGTH = 1000;
