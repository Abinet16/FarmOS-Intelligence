import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export type Tx = Prisma.TransactionClient;

export interface DbScope {
  organizationId: string;
  userId: string;
}

/**
 * The API connects as a role subject to row-level security. Tenant data is only
 * visible inside withTenant()/withUser(), which set the RLS context for the
 * lifetime of one transaction. Queries made directly on this client see no
 * tenant rows at all, so a forgotten scope fails closed instead of leaking.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: env.DATABASE_POOL_MAX,
        // A runaway query is cancelled instead of holding a connection (and its
        // transaction's locks) until the pool runs dry.
        statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
      }),
    });
  }

  /** Runs fn with access to one organization's rows on behalf of a user. */
  withTenant<T>(scope: DbScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${scope.organizationId}, true), set_config('app.current_user_id', ${scope.userId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Runs fn with access to one organization's rows on behalf of the system
   * (scheduled and background jobs). No user is set, so policies that rely on
   * the current user match nothing.
   */
  withOrganization<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }

  /** Ids of active organizations, for jobs that run across all of them. */
  async activeOrganizationIds(): Promise<string[]> {
    const rows = await this.$queryRaw<{ id: string }[]>`SELECT app_active_organization_ids() AS id`;
    return rows.map((row) => row.id);
  }

  /**
   * Runs fn as a user with no tenant selected. RLS then exposes only the
   * user's own memberships and the organizations they belong to.
   */
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
