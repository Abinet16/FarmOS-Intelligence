import { ALERT_RULES, type AlertRule, type ReportType } from '@farmos/shared-types';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../database/prisma.service.js';
import { flockSummary } from '../analytics/analytics.service.js';
import type { DateRange } from '../analytics/analytics.schemas.js';
import { loadFlockWindows } from '../analytics/flock-windows.js';
import { computeStock } from '../inventory/stock.js';
import { dateKey } from '../metrics/flock-metrics.js';
import { toCsv, type Column } from './csv.js';

const DAY_MS = 86_400_000;

/** What a report is generated for. The organization always comes from the tenant. */
export interface ReportInput {
  organizationId: string;
  /** The member who asked; "my entries" is limited to their own records. */
  userId: string;
  /** Null for reports that aren't dated (current stock). */
  range: DateRange | null;
  /** The organization's today, for "overdue". */
  today: Date;
  farmId?: string;
  batchId?: string;
}

export interface ReportDefinition<T> {
  columns: readonly Column<T>[];
  load(tx: Tx, input: ReportInput): Promise<T[]>;
}

const flockLabel = {
  select: {
    batchCode: true,
    house: { select: { name: true, farm: { select: { name: true } } } },
  },
} as const satisfies Prisma.FlockBatchDefaultArgs;

type FlockLabel = Prisma.FlockBatchGetPayload<typeof flockLabel>;

const person = { select: { name: true } } as const;

/** Flock, house and farm columns shared by every per-flock report. */
function flockColumns<T>(flock: (row: T) => FlockLabel): Column<T>[] {
  return [
    { header: 'Farm', value: (row) => flock(row).house.farm.name },
    { header: 'House', value: (row) => flock(row).house.name },
    { header: 'Flock', value: (row) => flock(row).batchCode },
  ];
}

/** Records of flocks at one farm or of one flock. */
function batchFilter(input: ReportInput) {
  return {
    ...(input.batchId && { batchId: input.batchId }),
    ...(input.farmId && { batch: { house: { farmId: input.farmId } } }),
  };
}

/** Calendar days of the range, inclusive. */
function dayFilter(range: DateRange | null) {
  return range ? { gte: range.from, lte: range.to } : undefined;
}

/** Instants inside the range's calendar days (UTC). */
function instantFilter(range: DateRange | null) {
  return range ? { gte: range.from, lt: new Date(range.to.getTime() + DAY_MS) } : undefined;
}

type Summary = ReturnType<typeof flockSummary>;
const flockPerformance: ReportDefinition<Summary & { farm: string }> = {
  columns: [
    { header: 'Farm', value: (row) => row.farm },
    { header: 'House', value: (row) => row.flock.house.name },
    { header: 'Flock', value: (row) => row.flock.batchCode },
    { header: 'Purpose', value: (row) => row.flock.purpose },
    { header: 'Breed', value: (row) => row.flock.breed },
    { header: 'Days', value: (row) => row.days },
    { header: 'Starting birds', value: (row) => row.totals.startingBirds },
    { header: 'Deaths', value: (row) => row.totals.deaths },
    { header: 'Mortality %', value: (row) => row.kpis.mortalityPct, decimals: 2 },
    { header: 'Birds at end', value: (row) => row.birdsAtEnd },
    { header: 'Eggs', value: (row) => (row.flock.purpose === 'BROILER' ? null : row.totals.eggs) },
    { header: 'Hen-day %', value: (row) => row.kpis.henDayPct, decimals: 2 },
    { header: 'Days with egg counts', value: (row) => row.totals.daysWithEggs },
    { header: 'Feed kg', value: (row) => row.totals.feedKg, decimals: 1 },
    { header: 'Feed per bird kg', value: (row) => row.kpis.feedPerBirdKg, decimals: 3 },
    { header: 'Days with feed', value: (row) => row.totals.daysWithFeed },
    { header: 'FCR', value: (row) => row.fcr, decimals: 2 },
  ],
  async load(tx, input) {
    const windows = await loadFlockWindows(tx, input.organizationId, input.range!, input);
    return windows.map((window) => ({
      ...flockSummary(window),
      farm: window.flock.house.farm.name,
    }));
  },
};

interface DailyRow {
  flock: FlockLabel & { purpose: string };
  day: Awaited<ReturnType<typeof loadFlockWindows>>[number]['rows'][number];
}
const dailyProduction: ReportDefinition<DailyRow> = {
  columns: [
    { header: 'Date', value: (row) => row.day.date },
    ...flockColumns<DailyRow>((row) => row.flock),
    { header: 'Age (days)', value: (row) => row.day.ageDays },
    { header: 'Opening birds', value: (row) => row.day.openingBirds },
    { header: 'Deaths', value: (row) => row.day.deaths },
    { header: 'Closing birds', value: (row) => row.day.closingBirds },
    { header: 'Mortality %', value: (row) => row.day.mortalityRatePct, decimals: 3 },
    { header: 'Eggs', value: (row) => row.day.eggs },
    { header: 'Hen-day %', value: (row) => row.day.henDayPct, decimals: 2 },
    { header: 'Feed kg', value: (row) => row.day.feedKg, decimals: 3 },
    { header: 'Feed per bird kg', value: (row) => row.day.feedPerBirdKg, decimals: 4 },
    { header: 'Water litres', value: (row) => row.day.waterLitres, decimals: 2 },
    { header: 'Average weight g', value: (row) => row.day.averageWeightGrams, decimals: 1 },
  ],
  async load(tx, input) {
    const windows = await loadFlockWindows(tx, input.organizationId, input.range!, input);
    return windows
      .flatMap(({ flock, rows }) => rows.map((day) => ({ flock, day })))
      .sort((a, b) => a.day.date.localeCompare(b.day.date));
  },
};

const mortalityInclude = {
  batch: flockLabel,
  recorder: person,
  voider: person,
} as const satisfies Prisma.MortalityEventInclude;
type MortalityRow = Prisma.MortalityEventGetPayload<{ include: typeof mortalityInclude }>;
const mortality: ReportDefinition<MortalityRow> = {
  columns: [
    { header: 'Date', value: (row) => dateKey(row.eventDate) },
    ...flockColumns<MortalityRow>((row) => row.batch),
    { header: 'Deaths', value: (row) => row.quantity },
    { header: 'Reason', value: (row) => row.reasonCode },
    { header: 'Notes', value: (row) => row.notes },
    { header: 'Recorded by', value: (row) => row.recorder.name },
    { header: 'Recorded at', value: (row) => row.createdAt },
    { header: 'Voided', value: (row) => row.voidedAt !== null },
    { header: 'Void reason', value: (row) => row.voidReason },
  ],
  load: (tx, input) =>
    tx.mortalityEvent.findMany({
      where: {
        organizationId: input.organizationId,
        eventDate: dayFilter(input.range),
        ...batchFilter(input),
      },
      include: mortalityInclude,
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
    }),
};

const healthInclude = {
  batch: flockLabel,
  recorder: person,
} as const satisfies Prisma.HealthEventInclude;
type HealthRow = Prisma.HealthEventGetPayload<{ include: typeof healthInclude }>;
const healthEvents: ReportDefinition<HealthRow> = {
  columns: [
    { header: 'Observed at', value: (row) => row.observedAt },
    ...flockColumns<HealthRow>((row) => row.batch),
    { header: 'Category', value: (row) => row.category },
    { header: 'Severity', value: (row) => row.severity },
    { header: 'Description', value: (row) => row.description },
    { header: 'Status', value: (row) => row.resolutionStatus },
    { header: 'Recorded by', value: (row) => row.recorder.name },
  ],
  load: (tx, input) =>
    tx.healthEvent.findMany({
      where: {
        organizationId: input.organizationId,
        observedAt: instantFilter(input.range),
        ...batchFilter(input),
      },
      include: healthInclude,
      orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    }),
};

const vaccinationInclude = {
  batch: flockLabel,
  vaccine: { select: { name: true } },
  recorder: person,
} as const satisfies Prisma.VaccinationRecordInclude;
type VaccinationRow = Prisma.VaccinationRecordGetPayload<{ include: typeof vaccinationInclude }> & {
  overdue: boolean;
};
const vaccinations: ReportDefinition<VaccinationRow> = {
  columns: [
    { header: 'Scheduled date', value: (row) => dateKey(row.scheduledDate) },
    ...flockColumns<VaccinationRow>((row) => row.batch),
    { header: 'Vaccine', value: (row) => row.vaccine.name },
    { header: 'Status', value: (row) => row.status },
    { header: 'Overdue', value: (row) => row.overdue },
    { header: 'Administered at', value: (row) => row.administeredAt },
    { header: 'Recorded by', value: (row) => row.recorder?.name },
  ],
  async load(tx, input) {
    const rows = await tx.vaccinationRecord.findMany({
      where: {
        organizationId: input.organizationId,
        scheduledDate: dayFilter(input.range),
        ...batchFilter(input),
      },
      include: vaccinationInclude,
      orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      ...row,
      overdue: row.status === 'SCHEDULED' && row.scheduledDate < input.today,
    }));
  },
};

type StockRow = Awaited<ReturnType<typeof computeStock>>[number];
const inventoryStock: ReportDefinition<StockRow> = {
  columns: [
    { header: 'Item', value: (row) => row.item.name },
    { header: 'Unit', value: (row) => row.item.unit },
    { header: 'Farm', value: (row) => row.farm.name },
    { header: 'Balance', value: (row) => row.balance, decimals: 3 },
    { header: 'Reorder level', value: (row) => row.reorderLevel, decimals: 3 },
    { header: 'Below reorder level', value: (row) => row.belowReorder },
  ],
  load: (tx, input) => computeStock(tx, input.organizationId, { farmId: input.farmId }),
};

const alertInclude = {
  batch: { select: { batchCode: true } },
  acknowledger: person,
  resolver: person,
} as const satisfies Prisma.AlertInclude;
type AlertRow = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;
const alerts: ReportDefinition<AlertRow> = {
  columns: [
    { header: 'Raised at', value: (row) => row.createdAt },
    { header: 'Rule', value: (row) => row.ruleCode },
    { header: 'Description', value: (row) => ALERT_RULES[row.ruleCode as AlertRule] },
    { header: 'Severity', value: (row) => row.severity },
    { header: 'Status', value: (row) => row.status },
    { header: 'Flock', value: (row) => row.batch?.batchCode },
    { header: 'Details', value: (row) => (row.details ? JSON.stringify(row.details) : null) },
    { header: 'Acknowledged by', value: (row) => row.acknowledger?.name },
    { header: 'Acknowledged at', value: (row) => row.acknowledgedAt },
    { header: 'Resolved by', value: (row) => row.resolver?.name },
    { header: 'Resolved at', value: (row) => row.resolvedAt },
  ],
  load: (tx, input) =>
    tx.alert.findMany({
      where: {
        organizationId: input.organizationId,
        createdAt: instantFilter(input.range),
        ...(input.batchId && { batchId: input.batchId }),
      },
      include: alertInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
};

interface EntryRow {
  date: Date;
  record: string;
  flock: string;
  quantity: number | null;
  unit: string;
  details: string | null;
  status: string;
  enteredAt: Date;
}
const myEntries: ReportDefinition<EntryRow> = {
  columns: [
    { header: 'Date', value: (row) => dateKey(row.date) },
    { header: 'Record', value: (row) => row.record },
    { header: 'Flock', value: (row) => row.flock },
    { header: 'Quantity', value: (row) => row.quantity },
    { header: 'Unit', value: (row) => row.unit },
    { header: 'Details', value: (row) => row.details },
    { header: 'Status', value: (row) => row.status },
    { header: 'Entered at', value: (row) => row.enteredAt },
  ],
  async load(tx, input) {
    const own = { organizationId: input.organizationId };
    const batch = { select: { batchCode: true } };
    const [logs, deaths, feed] = await Promise.all([
      tx.productionLog.findMany({
        where: { ...own, createdBy: input.userId, logDate: dayFilter(input.range) },
        include: { batch },
      }),
      tx.mortalityEvent.findMany({
        where: { ...own, recordedBy: input.userId, eventDate: dayFilter(input.range) },
        include: { batch },
      }),
      tx.feedUsage.findMany({
        where: { ...own, recordedBy: input.userId, usageDate: dayFilter(input.range) },
        include: { batch, feedType: { select: { name: true } } },
      }),
    ]);
    const rows: EntryRow[] = [
      ...logs.flatMap((log) => [
        {
          date: log.logDate,
          record: 'Eggs',
          flock: log.batch.batchCode,
          quantity: log.eggsCollected,
          unit: 'eggs',
          details: log.notes,
          status: log.status,
          enteredAt: log.createdAt,
        },
        ...(log.waterConsumption === null
          ? []
          : [
              {
                date: log.logDate,
                record: 'Water',
                flock: log.batch.batchCode,
                quantity: Number(log.waterConsumption),
                unit: 'litres',
                details: null,
                status: log.status,
                enteredAt: log.createdAt,
              },
            ]),
      ]),
      ...deaths.map((event) => ({
        date: event.eventDate,
        record: 'Deaths',
        flock: event.batch.batchCode,
        quantity: event.quantity,
        unit: 'birds',
        details: event.reasonCode,
        status: event.voidedAt ? 'VOIDED' : 'RECORDED',
        enteredAt: event.createdAt,
      })),
      ...feed.map((usage) => ({
        date: usage.usageDate,
        record: 'Feed',
        flock: usage.batch.batchCode,
        quantity: Number(usage.quantityKg),
        unit: 'kg',
        details: usage.feedType.name,
        status: usage.voidedAt ? 'VOIDED' : 'RECORDED',
        enteredAt: usage.createdAt,
      })),
    ];
    return rows.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || a.enteredAt.getTime() - b.enteredAt.getTime(),
    );
  },
};

export interface RenderedReport {
  csv: string;
  rowCount: number;
}

/** More rows than a direct download allows; the member should generate a report instead. */
export class TooManyRowsError extends Error {
  constructor(readonly limit: number) {
    super(`More than ${limit} rows`);
  }
}

export type ReportRenderer = (
  tx: Tx,
  input: ReportInput,
  maxRows?: number,
) => Promise<RenderedReport>;

function renderer<T>(definition: ReportDefinition<T>): ReportRenderer {
  return async (tx, input, maxRows = Number.POSITIVE_INFINITY) => {
    const rows = await definition.load(tx, input);
    if (rows.length > maxRows) throw new TooManyRowsError(maxRows);
    return { csv: toCsv(definition.columns, rows), rowCount: rows.length };
  };
}

/** Every report type, rendered to CSV. Used by direct exports and by report jobs. */
export const REPORTS: Record<ReportType, ReportRenderer> = {
  flock_performance: renderer(flockPerformance),
  daily_production: renderer(dailyProduction),
  mortality: renderer(mortality),
  health_events: renderer(healthEvents),
  vaccinations: renderer(vaccinations),
  inventory_stock: renderer(inventoryStock),
  alerts: renderer(alerts),
  my_entries: renderer(myEntries),
};
