// Creates a migration from the difference between the database and
// schema.prisma, without applying it. Hand-written SQL (CHECK constraints,
// partial indexes, policies) can then be appended before `migrate deploy`.
//
// `prisma migrate dev` can't be used here: its shadow database replays the RLS
// migration, which revokes access to _prisma_migrations, a table the shadow
// database doesn't have.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('usage: pnpm db:migration:new <snake_case_name>');
  process.exit(1);
}

const sql = execFileSync(
  'prisma',
  [
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
if (/^-- This is an empty migration\.?\s*$/m.test(sql) || !sql.trim()) {
  console.log('schema.prisma matches the database; nothing to generate.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = join('prisma', 'migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), sql);
console.log(`Created ${dir}/migration.sql — review it, add any raw SQL, then run migrate deploy.`);
