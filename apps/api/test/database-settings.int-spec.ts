import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './support/app.js';

/** Connection settings reach Postgres. */
describe('database settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies the statement timeout to every connection', async () => {
    const [row] = await prisma.$queryRaw<{ statement_timeout: string }[]>`SHOW statement_timeout`;
    expect(row?.statement_timeout).toBe('30s');
  });

  it('cancels a statement that runs past it', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = 50`;
        await tx.$queryRaw`SELECT pg_sleep(1)`;
      }),
    ).rejects.toThrow(/statement timeout|canceling statement/i);
  });
});
