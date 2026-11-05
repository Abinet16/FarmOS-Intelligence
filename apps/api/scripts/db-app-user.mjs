// Creates (or updates) the login role the API uses at runtime.
//
// The role name and password come from DATABASE_URL, so each environment keeps
// its credentials in its own secret store and nothing is committed. The role is
// made a member of farmos_app (created by the tenant_rls migration), which holds
// the table grants and is subject to row-level security.
//
// Usage: node --env-file=.env scripts/db-app-user.mjs   (after migrations)
import pg from 'pg';

const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl) {
  console.error('DATABASE_URL and MIGRATION_DATABASE_URL must both be set.');
  process.exit(1);
}

const { username, password } = new URL(appUrl);
const ownerUser = new URL(ownerUrl).username;
if (!username || !password) {
  console.error('DATABASE_URL must include a username and password.');
  process.exit(1);
}
if (username === ownerUser) {
  console.error('DATABASE_URL must use a different role than MIGRATION_DATABASE_URL.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
try {
  const role = client.escapeIdentifier(decodeURIComponent(username));
  const secret = client.escapeLiteral(decodeURIComponent(password));
  const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
    decodeURIComponent(username),
  ]);
  if (rowCount === 0) {
    await client.query(
      `CREATE ROLE ${role} LOGIN NOBYPASSRLS PASSWORD ${secret} IN ROLE farmos_app`,
    );
    console.log(`Created role ${role}.`);
  } else {
    await client.query(`ALTER ROLE ${role} LOGIN NOBYPASSRLS PASSWORD ${secret}`);
    await client.query(`GRANT farmos_app TO ${role}`);
    console.log(`Updated role ${role}.`);
  }
} finally {
  await client.end();
}
