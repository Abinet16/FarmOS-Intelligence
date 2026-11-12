import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations run as the schema owner. The API itself connects with DATABASE_URL,
// a non-owner role that is subject to row-level security.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Not env(), which throws when unset: `prisma generate` runs on install (CI,
    // Docker builds) with no database configured. Migrate commands still require it.
    url: process.env.MIGRATION_DATABASE_URL,
  },
});
