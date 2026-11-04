import base from '@farmos/eslint-config';

export default [...base, { ignores: ['prisma.config.ts', 'vitest.config*.ts'] }];
