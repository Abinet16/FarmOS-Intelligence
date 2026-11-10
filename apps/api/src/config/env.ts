import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /**
   * Express `trust proxy`: how to find the client address behind a load
   * balancer. A hop count ("1"), "true", or a list of proxy addresses/subnets.
   * Defaults to trusting nothing, which is right when clients connect directly.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value): boolean | number | string => {
      if (!value || value === 'false') return false;
      if (value === 'true') return true;
      return /^\d+$/.test(value) ? Number(value) : value;
    }),
  /**
   * Claude API key for the assistant. Without it the assistant answers 503;
   * everything else works.
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).default('claude-opus-5-5'),
  /** Questions one user may ask per organization per day. */
  AI_DAILY_QUESTION_LIMIT: z.coerce.number().int().positive().default(50),
});

export type Env = z.infer<typeof envSchema>;

/** Fails fast at boot with a readable message instead of at the first query. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
