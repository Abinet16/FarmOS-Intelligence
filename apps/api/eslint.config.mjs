import base from '@farmos/eslint-config';

export default [
  ...base,
  { ignores: ['prisma.config.ts', 'vitest.config*.ts'] },
  {
    // Plain Node scripts are not type-checked, so declare the globals they use.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
];
