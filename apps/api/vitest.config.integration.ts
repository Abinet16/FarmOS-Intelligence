import 'dotenv/config';
import { defineConfig } from 'vitest/config';

/** Integration tests: run against the real PostgreSQL instance in DATABASE_URL. */
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.int-spec.ts'],
    fileParallelism: false,
  },
});
