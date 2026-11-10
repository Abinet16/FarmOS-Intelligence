import { defineConfig } from 'vitest/config';

/** Unit tests: fast, no database. */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'eval/**/*.spec.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.spec.ts'],
    },
  },
});
