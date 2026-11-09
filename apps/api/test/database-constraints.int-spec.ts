import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Proves the database enforces integrity on its own, independent of the
 * application layer. Connects as the schema owner, which bypasses row-level
 * security, so only constraints and triggers stand in the way.
 */
describe('database constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  let actorId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: 'Recorder', email: `recorder-${randomUUID()}@example.test` },
    });
    actorId = user.id;
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
            createdBy: actorId,
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
        createdBy: actorId,
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
            recordedBy: actorId,
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

  describe('flock lifecycle', () => {
    it('allows only one active batch per house', async () => {
      const org = await createOrg('Life');
      const { house, batch } = await createBatch(org.id);
      await prisma.flockBatch.update({ where: { id: batch.id }, data: { status: 'ACTIVE' } });

      await expect(
        prisma.flockBatch.create({
          data: {
            organizationId: org.id,
            houseId: house.id,
            batchCode: 'SECOND',
            breed: 'Ross 308',
            placementDate: new Date('2026-10-05'),
            initialBirds: 10,
            status: 'ACTIVE',
          },
        }),
      ).rejects.toThrow(/flock_batches_one_active_per_house|Unique constraint/);
    });

    it('requires an end date exactly when a batch has ended', async () => {
      const org = await createOrg('Life');
      const { batch } = await createBatch(org.id);

      await expect(
        prisma.flockBatch.update({ where: { id: batch.id }, data: { status: 'DEPLETED' } }),
      ).rejects.toThrow(/flock_batches_end_date_status_check/);
      await expect(
        prisma.flockBatch.update({
          where: { id: batch.id },
          data: { endDate: new Date('2026-11-01') },
        }),
      ).rejects.toThrow(/flock_batches_end_date_status_check/);
    });

    it('rejects an end date before placement', async () => {
      const org = await createOrg('Life');
      const { batch } = await createBatch(org.id);

      await expect(
        prisma.flockBatch.update({
          where: { id: batch.id },
          data: { status: 'DEPLETED', endDate: new Date('2026-09-01') },
        }),
      ).rejects.toThrow(/flock_batches_end_date_check/);
    });
  });

  describe('record integrity', () => {
    it('sets approval fields exactly when a log is approved', async () => {
      const org = await createOrg('Approve');
      const { batch } = await createBatch(org.id);
      const log = await prisma.productionLog.create({
        data: {
          organizationId: org.id,
          batchId: batch.id,
          logDate: new Date('2026-10-02'),
          eggsCollected: 10,
          createdBy: actorId,
        },
      });

      await expect(
        prisma.productionLog.update({ where: { id: log.id }, data: { status: 'APPROVED' } }),
      ).rejects.toThrow(/production_logs_approval_check/);
      await expect(
        prisma.productionLog.update({
          where: { id: log.id },
          data: { status: 'APPROVED', approvedBy: actorId, approvedAt: new Date() },
        }),
      ).resolves.toMatchObject({ status: 'APPROVED' });
    });

    it('rejects zero or negative feed quantities', async () => {
      const org = await createOrg('Feed');
      const { batch } = await createBatch(org.id);
      const feedType = await prisma.feedType.create({
        data: { organizationId: org.id, name: 'Starter' },
      });

      await expect(
        prisma.feedUsage.create({
          data: {
            organizationId: org.id,
            batchId: batch.id,
            feedTypeId: feedType.id,
            usageDate: new Date('2026-10-02'),
            quantityKg: 0,
            recordedBy: actorId,
          },
        }),
      ).rejects.toThrow(/feed_usage_quantity_kg_check/);
    });
  });

  describe('corrections, voids and transfers', () => {
    it('allows one pending correction per log and reviews it all at once', async () => {
      const org = await createOrg('Review');
      const { batch } = await createBatch(org.id);
      const log = await prisma.productionLog.create({
        data: {
          organizationId: org.id,
          batchId: batch.id,
          logDate: new Date('2026-10-02'),
          eggsCollected: 10,
          createdBy: actorId,
        },
      });
      const correction = {
        organizationId: org.id,
        productionLogId: log.id,
        proposedChanges: { eggsCollected: 11 },
        reason: 'recount',
        requestedBy: actorId,
      };
      const first = await prisma.productionLogCorrection.create({ data: correction });

      await expect(prisma.productionLogCorrection.create({ data: correction })).rejects.toThrow(
        /production_log_corrections_one_pending_per_log|Unique constraint/,
      );
      await expect(
        prisma.productionLogCorrection.update({
          where: { id: first.id },
          data: { status: 'APPROVED' },
        }),
      ).rejects.toThrow(/production_log_corrections_review_check/);
    });

    it('requires who, when and why to void a record', async () => {
      const org = await createOrg('Void');
      const { batch } = await createBatch(org.id);
      const death = await prisma.mortalityEvent.create({
        data: {
          organizationId: org.id,
          batchId: batch.id,
          eventDate: new Date('2026-10-02'),
          quantity: 1,
          reasonCode: 'UNKNOWN',
          recordedBy: actorId,
        },
      });

      await expect(
        prisma.mortalityEvent.update({
          where: { id: death.id },
          data: { voidedAt: new Date(), voidedBy: actorId },
        }),
      ).rejects.toThrow(/mortality_events_void_check/);
    });

    it('requires a transfer id on transfer movements only', async () => {
      const org = await createOrg('Transfer');
      const { farm } = await createBatch(org.id);
      const item = await prisma.inventoryItem.create({
        data: { organizationId: org.id, name: 'Grit', unit: 'kg' },
      });
      const movement = {
        organizationId: org.id,
        itemId: item.id,
        farmId: farm.id,
        quantity: 1,
        occurredAt: new Date(),
        recordedBy: actorId,
      };

      await expect(
        prisma.inventoryMovement.create({ data: { ...movement, movementType: 'TRANSFER_IN' } }),
      ).rejects.toThrow(/inventory_movements_transfer_check/);
      await expect(
        prisma.inventoryMovement.create({
          data: { ...movement, movementType: 'RECEIPT', transferId: randomUUID() },
        }),
      ).rejects.toThrow(/inventory_movements_transfer_check/);
    });
  });

  describe('alerts', () => {
    it('keeps review fields consistent with status and dedupes by key', async () => {
      const org = await createOrg('Alerts');
      const alert = {
        organizationId: org.id,
        ruleCode: 'LOW_STOCK',
        severity: 'MEDIUM' as const,
        dedupeKey: 'LOW_STOCK:x@y:2026-10-01',
      };
      const created = await prisma.alert.create({ data: alert });

      await expect(prisma.alert.create({ data: alert })).rejects.toThrow();
      await expect(
        prisma.alert.update({ where: { id: created.id }, data: { status: 'RESOLVED' } }),
      ).rejects.toThrow(/alerts_resolved_check/);
      await expect(
        prisma.alert.update({ where: { id: created.id }, data: { status: 'ACKNOWLEDGED' } }),
      ).rejects.toThrow(/alerts_status_check/);
    });
  });

  describe('actor references', () => {
    it('rejects a record attributed to a user that does not exist', async () => {
      const org = await createOrg('Actor');
      const { batch } = await createBatch(org.id);

      await expect(
        prisma.mortalityEvent.create({
          data: {
            organizationId: org.id,
            batchId: batch.id,
            eventDate: new Date('2026-10-02'),
            quantity: 1,
            reasonCode: 'UNKNOWN',
            recordedBy: randomUUID(),
          },
        }),
      ).rejects.toThrow();
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
