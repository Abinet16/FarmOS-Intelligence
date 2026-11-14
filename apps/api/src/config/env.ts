import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  /** Queues for background jobs (reports, scheduled alert checks, email). */
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  /** Namespaces queue keys, so tests and several environments can share one Redis. */
  QUEUE_PREFIX: z.string().min(1).default('farmos'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  /** "json" writes one JSON object per line for log collectors; "pretty" is for terminals. */
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  /** The least severe level written: debug < log < warn < error. */
  LOG_LEVEL: z.enum(['debug', 'log', 'warn', 'error']).default('log'),
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
  /** Where generated report files are written (local disk until object storage in week 10). */
  REPORTS_DIR: z.string().min(1).default('var/reports'),
  /** Days a generated report can be downloaded before its file is deleted. */
  REPORT_RETENTION_DAYS: z.coerce.number().int().positive().max(90).default(7),
  /** Cron pattern (UTC) for the scheduled alert evaluation of every organization. */
  ALERT_EVALUATION_CRON: z.string().min(1).default('15 * * * *'),
  /** How email is delivered. "log" writes messages to the worker log (development). */
  MAIL_TRANSPORT: z.enum(['log']).default('log'),
  MAIL_FROM: z.string().min(1).default('FarmOS <no-reply@farmos.local>'),
  /** Base URL of the web app, for links in emails. */
  WEB_URL: z.string().url().default('http://localhost:3000'),
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
