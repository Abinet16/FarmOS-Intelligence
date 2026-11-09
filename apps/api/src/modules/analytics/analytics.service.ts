import { Injectable, NotFoundException } from '@nestjs/common';
import { organizationToday } from '../../database/organization-today.js';
import { PrismaService, type Tx } from '../../database/prisma.service.js';
import type { TenantContext } from '../../common/request.js';
import { computeStock } from '../inventory/stock.js';
import {
  EMPTY_TOTALS,
  addTotals,
  combineDays,
  dateKey,
  feedConversionRatio,
  windowKpis,
  windowTotals,
} from '../metrics/flock-metrics.js';
import { resolveRange, type AnalyticsQuery, type DateRange } from './analytics.schemas.js';
import { loadFlockWindows, type FlockWindow } from './flock-windows.js';

const DAY_MS = 86_400_000;

/**
 * Window figures for one flock: KPIs, FCR and where the population ended.
 * FCR is reported for broilers only: adult layers barely gain weight, so
 * feed per kg of gain is meaningless for them (their efficiency is feed per
 * kg of eggs, which needs egg weights FarmOS doesn't record).
 */
function flockSummary({ flock, rows }: FlockWindow) {
  const totals = windowTotals(rows, flock.purpose);
  const last = rows.at(-1);
  return {
    flock: {
      id: flock.id,
      batchCode: flock.batchCode,
      breed: flock.breed,
      purpose: flock.purpose,
      status: flock.status,
      house: flock.house,
    },
    days: rows.length,
    birdsAtEnd: last?.closingBirds ?? null,
    totals,
    kpis: windowKpis(totals),
    fcr: flock.purpose === 'BROILER' ? feedConversionRatio(rows) : null,
  };
}

/**
 * Read-only KPIs for dashboards. Every figure is computed from the metric
 * definitions over the requested range; rates for groups of flocks come from
 * summed numerators and denominators.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  overview(tenant: TenantContext, query: AnalyticsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const { range, today } = await this.range(tx, tenant, query);
      const windows = await loadFlockWindows(tx, tenant.organizationId, range, query);
      const totals = windows.reduce(
        (sum, w) => addTotals(sum, windowTotals(w.rows, w.flock.purpose)),
        EMPTY_TOTALS,
      );

      const organizationId = tenant.organizationId;
      const farmFilter = query.farmId ? { batch: { house: { farmId: query.farmId } } } : {};
      const [active, deaths, openHealth, dueVaccinations, overdueVaccinations, stock, alerts] =
        await Promise.all([
          tx.flockBatch.findMany({
            where: {
              organizationId,
              status: 'ACTIVE',
              ...(query.farmId && { house: { farmId: query.farmId } }),
            },
            select: { id: true, initialBirds: true },
          }),
          tx.mortalityEvent.groupBy({
            by: ['batchId'],
            where: {
              organizationId,
              voidedAt: null,
              batch: { status: 'ACTIVE', ...(query.farmId && { house: { farmId: query.farmId } }) },
            },
            _sum: { quantity: true },
          }),
          tx.healthEvent.count({
            where: { organizationId, resolutionStatus: { not: 'RESOLVED' }, ...farmFilter },
          }),
          tx.vaccinationRecord.count({
            where: {
              organizationId,
              status: 'SCHEDULED',
              scheduledDate: { gte: today, lte: new Date(today.getTime() + 7 * DAY_MS) },
              ...farmFilter,
            },
          }),
          tx.vaccinationRecord.count({
            where: {
              organizationId,
              status: 'SCHEDULED',
              scheduledDate: { lt: today },
              ...farmFilter,
            },
          }),
          computeStock(tx, organizationId, { farmId: query.farmId, belowReorder: true }),
          tx.alert.groupBy({
            by: ['severity'],
            where: { organizationId, status: { not: 'RESOLVED' } },
            _count: { _all: true },
          }),
        ]);

      const dead = deaths.reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0);
      return {
        range: { from: dateKey(range.from), to: dateKey(range.to) },
        flocks: {
          active: active.length,
          liveBirds: active.reduce((sum, flock) => sum + flock.initialBirds, 0) - dead,
          inRange: windows.length,
        },
        production: { totals, kpis: windowKpis(totals) },
        health: {
          openEvents: openHealth,
          vaccinationsDueThisWeek: dueVaccinations,
          vaccinationsOverdue: overdueVaccinations,
        },
        inventory: { lowStock: stock.length },
        alerts: Object.fromEntries(alerts.map((row) => [row.severity, row._count._all])),
      };
    });
  }

  /** Daily series across flocks, for charts. */
  trend(tenant: TenantContext, query: AnalyticsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const { range } = await this.range(tx, tenant, query);
      const windows = await loadFlockWindows(tx, tenant.organizationId, range, query);
      return {
        range: { from: dateKey(range.from), to: dateKey(range.to) },
        days: combineDays(windows.map((w) => ({ purpose: w.flock.purpose, rows: w.rows }))),
      };
    });
  }

  /** One row per farm, comparable because rates are weighted by birds. */
  farms(tenant: TenantContext, query: AnalyticsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const { range } = await this.range(tx, tenant, query);
      const windows = await loadFlockWindows(tx, tenant.organizationId, range, query);

      const byFarm = new Map<
        string,
        {
          farm: { id: string; name: string };
          flocks: number;
          birdsAtEnd: number;
          totals: typeof EMPTY_TOTALS;
        }
      >();
      for (const window of windows) {
        const farm = window.flock.house.farm;
        const entry = byFarm.get(farm.id) ?? {
          farm,
          flocks: 0,
          birdsAtEnd: 0,
          totals: EMPTY_TOTALS,
        };
        entry.flocks += 1;
        entry.birdsAtEnd += window.rows.at(-1)?.closingBirds ?? 0;
        entry.totals = addTotals(entry.totals, windowTotals(window.rows, window.flock.purpose));
        byFarm.set(farm.id, entry);
      }
      return {
        range: { from: dateKey(range.from), to: dateKey(range.to) },
        farms: [...byFarm.values()]
          .map((entry) => ({ ...entry, kpis: windowKpis(entry.totals) }))
          .sort((a, b) => a.farm.name.localeCompare(b.farm.name)),
      };
    });
  }

  /** One row per flock in the range: KPIs and FCR side by side. */
  flocks(tenant: TenantContext, query: AnalyticsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const { range } = await this.range(tx, tenant, query);
      const windows = await loadFlockWindows(tx, tenant.organizationId, range, query);
      return {
        range: { from: dateKey(range.from), to: dateKey(range.to) },
        flocks: windows.map(flockSummary),
      };
    });
  }

  /** One flock: window summary plus its daily rows, oldest first, for charts. */
  flock(tenant: TenantContext, batchId: string, query: AnalyticsQuery) {
    return this.prisma.withTenant(tenant, async (tx) => {
      const exists = await tx.flockBatch.findFirst({
        where: { id: batchId, organizationId: tenant.organizationId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Flock batch not found');

      const { range } = await this.range(tx, tenant, query);
      const [window] = await loadFlockWindows(tx, tenant.organizationId, range, { batchId });
      return {
        range: { from: dateKey(range.from), to: dateKey(range.to) },
        summary: window ? flockSummary(window) : null,
        days: window?.rows ?? [],
      };
    });
  }

  private async range(
    tx: Tx,
    tenant: TenantContext,
    query: AnalyticsQuery,
  ): Promise<{ range: DateRange; today: Date }> {
    const today = await organizationToday(tx, tenant.organizationId);
    return { range: resolveRange(query, today), today };
  }
}
