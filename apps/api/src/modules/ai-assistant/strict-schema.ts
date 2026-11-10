import { z } from 'zod';

/**
 * Keywords strict tool use can't enforce. They are left out of the schema the
 * model sees; the server still enforces every one of them, because each tool
 * input is parsed with its full Zod schema before anything runs.
 */
const UNSUPPORTED = new Set([
  '$schema',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
]);

function strip(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strip);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !UNSUPPORTED.has(key))
      .map(([key, value]) => [key, strip(value)]),
  );
}

/** A Zod object as a strict-tool `input_schema`. */
export function strictInputSchema(schema: z.ZodObject) {
  return { type: 'object' as const, ...(strip(z.toJSONSchema(schema)) as Record<string, unknown>) };
}
