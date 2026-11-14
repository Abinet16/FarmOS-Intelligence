import type { Mock } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import { Heartbeat, type Probe } from '../../observability/heartbeat.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  async function build(queryRaw: Mock, probes: { redis?: Probe; worker?: Probe } = {}) {
    const heartbeat = {
      redisStatus: vi.fn().mockResolvedValue(probes.redis ?? 'up'),
      workerStatus: vi.fn().mockResolvedValue(probes.worker ?? 'up'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: Heartbeat, useValue: heartbeat },
      ],
    }).compile();
    return { controller: moduleRef.get(HealthController), heartbeat };
  }

  const answers = () => vi.fn().mockResolvedValue([{ '?column?': 1 }]);

  it('reports live without touching any dependency', async () => {
    const queryRaw = vi.fn();
    const { controller, heartbeat } = await build(queryRaw);
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(heartbeat.redisStatus).not.toHaveBeenCalled();
  });

  it('reports ready when the database, redis and a worker are up', async () => {
    const { controller } = await build(answers());
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up', worker: 'up' },
    });
  });

  it('stays ready but degraded without redis or a worker', async () => {
    const noWorker = (await build(answers(), { worker: 'down' })).controller;
    await expect(noWorker.ready()).resolves.toMatchObject({
      status: 'degraded',
      checks: { worker: 'down' },
    });
    const noRedis = (await build(answers(), { redis: 'down', worker: 'down' })).controller;
    await expect(noRedis.ready()).resolves.toMatchObject({
      status: 'degraded',
      checks: { redis: 'down' },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const { controller } = await build(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
