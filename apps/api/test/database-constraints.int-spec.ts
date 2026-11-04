import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Proves the database enforces integrity on its own, independent of the
 * application layer. Each test creates its own organizations so tests can run
 * against a shared database without cleanup ordering problems.
 */
describe('database constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  afterAll(() => prisma.$disconnect());

  async function createOrg(label: string) {
    return prisma.organization.create({
      data: { name: `${label} Org`, slug: `${label.toLowerCase()}-${randomUUID()}` },
    });
  }

  async function createBatch(organizationId: string) {
    const farm = await prisma.farm.create({ data: { organizationId, name: 'North' } });
    const house = await prisma.house.create({
      data: { organizationId, farmId: farm.id, name: 'H1', capacity: 5000 },
    });
    const batch = await prisma.flockBatch.create({
      data: {
        organizationId,
        houseId: house.id,
        batchCode: `B-${randomUUID().slice(0, 8)}`,
        breed: 'Lohmann Brown',
        placementDate: new Date('2026-10-01'),
        initialBirds: 4800,
      },
    });
    return { farm, house, batch };
  }

  describe('tenant consistency', () => {
    it('rejects a house that points at another tenant’s farm', async () => {
      const orgA = await createOrg('A');
      const orgB = await createOrg('B');
      const farmA = await prisma.farm.create({ data: { organizationId: orgA.id, name: 'A1' } });

      await expect(
        prisma.house.create({
          data: { organizationId: orgB.id, farmId: farmA.id, name: 'Smuggled', capacity: 10 },
        }),
      ).rejects.toThrow();
    });

    it('rejects a production log that points at another tenant’s batch', async () => {
      const orgA = await createOrg('A');
      const orgB = await createOrg('B');
      const { batch } = await createBatch(orgA.id);

      await expect(
        prisma.productionLog.create({
          data: {
            organizationId: orgB.id,
            batchId: batch.id,
            logDate: new Date('2026-10-02'),
            eggsCollected: 100,
            createdBy: randomUUID(),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('uniqueness', () => {
    it('allows only one production log per batch per day', async () => {
      const org = await createOrg('U');
      const { batch } = await createBatch(org.id);
      const log = {
        organizationId: org.id,
        batchId: batch.id,
        logDate: new Date('2026-10-02'),
        eggsCollected: 4100,
        createdBy: randomUUID(),
      };

      await prisma.productionLog.create({ data: log });
      await expect(prisma.productionLog.create({ data: log })).rejects.toThrow();
    });
  });

  describe('check constraints', () => {
    it('rejects negative mortality', async () => {
      const org = await createOrg('C');
      const { batch } = await createBatch(org.id);

      await expect(
        prisma.mortalityEvent.create({
          data: {
            organizationId: org.id,
            batchId: batch.id,
            eventDate: new Date('2026-10-02'),
            quantity: -3,
            reasonCode: 'UNKNOWN',
            recordedBy: randomUUID(),
          },
        }),
      ).rejects.toThrow(/mortality_events_quantity_check/);
    });

    it('rejects a flock with zero birds', async () => {
      const org = await createOrg('C');
      const { house } = await createBatch(org.id);

      await expect(
        prisma.flockBatch.create({
          data: {
            organizationId: org.id,
            houseId: house.id,
            batchCode: 'EMPTY',
            breed: 'Ross 308',
            placementDate: new Date('2026-10-01'),
            initialBirds: 0,
          },
        }),
      ).rejects.toThrow(/flock_batches_initial_birds_check/);
    });
  });

  describe('audit log', () => {
    it('is append-only', async () => {
      const org = await createOrg('Audit');
      const entry = await prisma.auditLog.create({
        data: { organizationId: org.id, action: 'farm.created', entityType: 'farm' },
      });

      await expect(
        prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
        /append-only/,
      );
    });
  });
});
