import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Heartbeat } from '../../observability/heartbeat.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly heartbeat: Heartbeat,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /**
   * Readiness: the process can serve traffic. Only the database is required.
   * Without Redis or a worker, requests still succeed and background work
   * waits in the database, so those make the status "degraded", not 503.
   */
  @Get('ready')
  async ready() {
    const [database, redis, worker] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.heartbeat.redisStatus(),
      this.heartbeat.workerStatus(),
    ]);
    const checks = { database, redis, worker };
    if (database === 'down') {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: redis === 'up' && worker === 'up' ? 'ok' : 'degraded', checks };
  }
}
