import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { createAuth } from './auth.js';

export const AUTH = Symbol('AUTH');

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [PrismaService, ENV],
      useFactory: (prisma: PrismaService, env: Env) => createAuth(prisma, env),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
