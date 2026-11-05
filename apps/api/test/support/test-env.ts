import 'dotenv/config';

/** Same server and roles as local dev, but a separate database: <name>_test. */
function toTestDatabase(url: string | undefined, name: string): string {
  if (!url) throw new Error(`${name} must be set (see apps/api/.env.example)`);
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) parsed.pathname = `/${database}_test`;
  return parsed.toString();
}

export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: toTestDatabase(process.env.DATABASE_URL, 'DATABASE_URL'),
  MIGRATION_DATABASE_URL: toTestDatabase(
    process.env.MIGRATION_DATABASE_URL,
    'MIGRATION_DATABASE_URL',
  ),
  BETTER_AUTH_URL: 'http://localhost:4000',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  CORS_ORIGINS: 'http://localhost:3000',
} as const;

export const WEB_ORIGIN = 'http://localhost:3000';
