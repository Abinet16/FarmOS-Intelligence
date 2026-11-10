import { defineConfig } from 'vitest/config';
import { testEnv } from './test/support/test-env.js';

/**
 * The assistant evaluation: the integration test database plus the real
 * model. Model cases run only when ANTHROPIC_API_KEY is set.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['eval/**/*.eval.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    env: testEnv,
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
