import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { loadEnv } from '../src/config/env.js';

/**
 * Exercises the RLS policies directly, as the runtime role, with no application
 * code in between. These tests are the backstop for a repository that forgets
 * an organization filter.
 */
describe('row-level security', () => {
  const owner = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const app = new PrismaService(loadEnv());

  let userA: string;
  let userB: string;
  let orgA: string;
  let orgB: string;
  let farmA: string;
  let farmB: string;

  beforeAll(async () => {
    // Seed as the owner, which bypasses RLS.
    const [a, b] = await Promise.all(
      ['a', 'b'].map((label) =>
        owner.user.create({
          data: { name: label, email: `rls-${label}-${randomUUID()}@example.test` },
        }),
      ),
    );
    userA = a!.id;
    userB = b!.id;
    for (const [label, userId] of [
      ['A', userA],
      ['B', userB],
    ] as const) {
      const org = await owner.organization.create({
        data: {
          name: `RLS ${label}`,
          slug: `rls-${label.toLowerCase()}-${randomUUID()}`,
          memberships: { create: { userId, role: 'OWNER' } },
          farms: { create: { name: `${label} farm` } },
        },
        include: { farms: true },
      });
      if (label === 'A') [orgA, farmA] = [org.id, org.farms[0]!.id];
      else [orgB, farmB] = [org.id, org.farms[0]!.id];
    }
  });

  afterAll(async () => {
    await Promise.all([owner.$disconnect(), app.$disconnect()]);
  });

  it('shows no tenant rows when no context is set (fails closed)', async () => {
    await expect(app.farm.findMany()).resolves.toEqual([]);
    await expect(app.organization.findMany()).resolves.toEqual([]);
    await expect(app.membership.findMany()).resolves.toEqual([]);
  });

  it('shows only the current tenant’s rows, even without a where clause', async () => {
    const farms = await app.withTenant({ organizationId: orgA, userId: userA }, (tx) =>
      tx.farm.findMany(),
    );
    expect(farms.map((f) => f.id)).toEqual([farmA]);
  });

  it('cannot read another tenant’s row by guessing its id', async () => {
    const farm = await app.withTenant({ organizationId: orgA, userId: userA }, (tx) =>
      tx.farm.findUnique({ where: { id: farmB } }),
    );
    expect(farm).toBeNull();
  });

  it('cannot insert a row into another tenant', async () => {
    await expect(
      app.withTenant({ organizationId: orgA, userId: userA }, (tx) =>
        tx.farm.create({ data: { organizationId: orgB, name: 'Smuggled' } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot update or delete another tenant’s rows', async () => {
    const result = await app.withTenant({ organizationId: orgA, userId: userA }, async (tx) => ({
      updated: await tx.farm.updateMany({ where: { id: farmB }, data: { name: 'Hijacked' } }),
      deleted: await tx.farm.deleteMany({ where: { id: farmB } }),
    }));
    expect(result).toEqual({ updated: { count: 0 }, deleted: { count: 0 } });

    const untouched = await owner.farm.findUniqueOrThrow({ where: { id: farmB } });
    expect(untouched.name).toBe('B farm');
  });

  it('lets a user see only their own memberships and organizations without a tenant', async () => {
    const result = await app.withUser(userA, async (tx) => ({
      memberships: await tx.membership.findMany(),
      organizations: await tx.organization.findMany(),
    }));
    expect(result.memberships.map((m) => m.organizationId)).toEqual([orgA]);
    expect(result.organizations.map((o) => o.id)).toEqual([orgA]);
  });

  it('hides a member’s other organizations once a tenant is selected', async () => {
    // Regression: permissive policies are OR-ed, so self-read policies used to
    // add the caller's memberships in *other* organizations to tenant queries.
    await owner.membership.create({
      data: { organizationId: orgB, userId: userA, role: 'AUDITOR' },
    });

    const inTenantA = await app.withTenant({ organizationId: orgA, userId: userA }, async (tx) => ({
      memberships: await tx.membership.findMany(),
      organizations: await tx.organization.findMany(),
    }));
    expect(inTenantA.memberships.map((m) => m.organizationId)).toEqual([orgA]);
    expect(inTenantA.organizations.map((o) => o.id)).toEqual([orgA]);

    const noTenant = await app.withUser(userA, (tx) => tx.membership.findMany());
    expect(noTenant.map((m) => m.organizationId).sort()).toEqual([orgA, orgB].sort());
  });

  it('does not leak context between transactions on a pooled connection', async () => {
    await app.withTenant({ organizationId: orgA, userId: userA }, (tx) => tx.farm.findMany());
    await expect(app.farm.findMany()).resolves.toEqual([]);
  });

  it('denies the runtime role any update of audit history', async () => {
    const scope = { organizationId: orgA, userId: userA };
    const entry = await app.withTenant(scope, (tx) =>
      tx.auditLog.create({
        data: { organizationId: orgA, actorId: userA, action: 'test', entityType: 'test' },
      }),
    );
    await expect(
      app.withTenant(scope, (tx) =>
        tx.auditLog.update({ where: { id: entry.id }, data: { action: 'x' } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('keeps the runtime role out of the migrations table', async () => {
    await expect(app.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`).rejects.toThrow(
      /permission denied/,
    );
  });
});
