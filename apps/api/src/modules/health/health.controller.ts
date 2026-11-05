import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the process can serve traffic (database reachable). */
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { database: 'down' },
      });
    }
  }
}
