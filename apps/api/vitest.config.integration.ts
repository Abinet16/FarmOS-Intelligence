import { defineConfig } from 'vitest/config';
import { testEnv } from './test/support/test-env.js';

/**
 * Integration tests: a real PostgreSQL database (<name>_test), rebuilt from the
 * migrations before every run, and the full Nest app over HTTP.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.int-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    env: testEnv,
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
