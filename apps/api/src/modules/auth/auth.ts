import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { CLIENT_IP_HEADER } from '../../common/client-ip.middleware.js';
import type { Env } from '../../config/env.js';
import type { PrismaService } from '../../database/prisma.service.js';

/**
 * Better Auth owns sign-up, sign-in, sessions and password hashing. It reads and
 * writes users, sessions, accounts and verifications, none of which are
 * tenant-scoped, so it runs on the plain client without an RLS context.
 */
export function createAuth(prisma: PrismaService, env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.CORS_ORIGINS,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: env.NODE_ENV !== 'test',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      // Set by the clientIp middleware from Express's resolved address.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      useSecureCookies: env.NODE_ENV === 'production',
      database: { generateId: () => randomUUID() },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
