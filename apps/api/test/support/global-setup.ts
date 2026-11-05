import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { testEnv } from './test-env.js';

/**
 * Recreates the test database from scratch on every run, so the suite also
 * proves that the full migration history applies cleanly to an empty database.
 */
export default async function setup() {
  const owner = new URL(testEnv.MIGRATION_DATABASE_URL);
  const database = owner.pathname.slice(1);
  const admin = new URL(owner);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(database)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, ...testEnv };
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env, stdio: 'inherit' });
  execFileSync('node', ['scripts/db-app-user.mjs'], { env, stdio: 'inherit' });
}
