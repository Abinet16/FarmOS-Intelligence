import { z } from 'zod';
import { submitAnswerDefinition } from './answer-schema.js';
import { strictInputSchema } from './strict-schema.js';

describe('strictInputSchema', () => {
  it('keeps types, formats and enums but drops constraints strict mode rejects', () => {
    const schema = strictInputSchema(
      z.strictObject({
        id: z.uuid(),
        day: z.iso.date(),
        note: z.string().min(1).max(10),
        count: z.number().int().min(0).max(5),
        tags: z
          .array(z.enum(['a', 'b']))
          .min(1)
          .max(3),
      }),
    );
    expect(schema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        day: { type: 'string', format: 'date' },
        note: { type: 'string' },
        count: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
      },
      required: ['id', 'day', 'note', 'count', 'tags'],
      additionalProperties: false,
    });
  });

  it('makes every field of submit_answer required', () => {
    expect(submitAnswerDefinition.input_schema).toMatchObject({
      required: ['status', 'answer', 'claims', 'dataGaps', 'suggestedChecks'],
      additionalProperties: false,
    });
  });
});
