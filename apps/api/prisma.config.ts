import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations run as the schema owner. The API itself connects with DATABASE_URL,
// a non-owner role that is subject to row-level security.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('MIGRATION_DATABASE_URL'),
  },
});
