import type { Mock } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  async function build(queryRaw: Mock) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('reports live without touching the database', async () => {
    const queryRaw = vi.fn();
    const controller = await build(queryRaw);
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready when the database answers', async () => {
    const controller = await build(vi.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('returns 503 when the database is unreachable', async () => {
    const controller = await build(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
