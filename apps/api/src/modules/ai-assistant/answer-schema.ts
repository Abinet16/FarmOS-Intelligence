import { ANSWER_STATUSES } from '@farmos/shared-types';
import { z } from 'zod';

/**
 * The shape every reply must take. The model submits it through a tool, so
 * the server can check citations and figures before the user sees anything.
 */
export const answerSchema = z.strictObject({
  status: z
    .enum(ANSWER_STATUSES)
    .describe(
      'ANSWERED when the records answer the question; INSUFFICIENT_DATA when they do not; OUT_OF_SCOPE for diagnosis, treatment, changing records or anything outside farm operations',
    ),
  answer: z.string().min(1).max(4000).describe('The reply to the user, in plain language'),
  claims: z
    .array(
      z.strictObject({
        statement: z.string().min(1).max(500).describe('One factual statement from the answer'),
        evidence: z
          .array(z.string().regex(/^E\d+$/))
          .min(1)
          .max(10)
          .describe('Evidence ids of the tool results that support it'),
      }),
    )
    .max(20)
    .describe('Every factual statement about the farm, each with its evidence'),
  dataGaps: z
    .array(z.string().min(1).max(300))
    .max(10)
    .describe('Missing or conflicting records that limit the answer'),
  suggestedChecks: z
    .array(z.string().min(1).max(300))
    .max(10)
    .describe('Practical checks a person could make; never a diagnosis or a treatment'),
});

export const SUBMIT_ANSWER = 'submit_answer';

export const submitAnswerDefinition = {
  name: SUBMIT_ANSWER,
  description:
    'Deliver the final answer. The server checks that every claim cites evidence from this turn and that every figure appears in that evidence; if not, it returns the problems to fix.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    ...(() => {
      const { $schema: _schema, ...schema } = z.toJSONSchema(answerSchema) as Record<
        string,
        unknown
      >;
      return schema;
    })(),
  },
};
