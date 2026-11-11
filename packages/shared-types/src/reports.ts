import type { Permission, Role } from './roles.js';
import { hasPermission } from './roles.js';

export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type ReportFilter = 'farmId' | 'batchId';

export interface ReportTypeInfo {
  label: string;
  description: string;
  /** Any one of these lets a member run the report. */
  permissions: readonly Permission[];
  /** Whether the report covers a date range (from/to). */
  dated: boolean;
  /** Longest range one report may cover. */
  maxRangeDays: number;
  filters: readonly ReportFilter[];
}

/**
 * The reports a member can generate or export as CSV. Every figure comes from
 * the same metric definitions as the dashboard.
 */
export const REPORT_TYPES = {
  flock_performance: {
    label: 'Flock performance',
    description: 'One row per flock: birds, deaths, mortality, eggs, hen-day, feed and FCR.',
    permissions: ['reports:view'],
    dated: true,
    maxRangeDays: 366,
    filters: ['farmId'],
  },
  daily_production: {
    label: 'Daily production',
    description: 'One row per flock per day: birds, deaths, eggs, feed, water and weights.',
    permissions: ['reports:view'],
    dated: true,
    maxRangeDays: 366,
    filters: ['farmId', 'batchId'],
  },
  mortality: {
    label: 'Mortality events',
    description: 'Every recorded death with its reason, notes and who recorded it.',
    permissions: ['reports:view'],
    dated: true,
    maxRangeDays: 366,
    filters: ['farmId', 'batchId'],
  },
  health_events: {
    label: 'Health observations',
    description: 'Health observations with severity and resolution status.',
    permissions: ['reports:view'],
    dated: true,
    maxRangeDays: 366,
    filters: ['farmId', 'batchId'],
  },
  vaccinations: {
    label: 'Vaccinations',
    description: 'Scheduled and administered vaccinations, with overdue ones marked.',
    permissions: ['reports:view'],
    dated: true,
    maxRangeDays: 366,
    filters: ['farmId', 'batchId'],
  },
  inventory_stock: {
    label: 'Inventory stock',
    description: 'Current stock per item and farm against reorder levels.',
    permissions: ['reports:view'],
    dated: false,
    maxRangeDays: 0,
    filters: ['farmId'],
  },
  alerts: {
    label: 'Alerts',
    description: 'Alerts raised in the range with their status and who handled them.',
    permissions: ['reports:view'],
    dated: true,
    maxRangeDays: 366,
    filters: ['batchId'],
  },
  my_entries: {
    label: 'My entries',
    description: 'The daily records you entered yourself, for checking your own work.',
    permissions: ['reports:view-limited', 'production:record'],
    dated: true,
    maxRangeDays: 31,
    filters: [],
  },
} as const satisfies Record<string, ReportTypeInfo>;

export type ReportType = keyof typeof REPORT_TYPES;

export interface ReportParameters {
  from?: string;
  to?: string;
  farmId?: string;
  batchId?: string;
}

export function canRunReport(role: Role, type: ReportType): boolean {
  return REPORT_TYPES[type].permissions.some((permission) => hasPermission(role, permission));
}

/** Direct CSV downloads cover shorter ranges; anything longer is a report job. */
export const EXPORT_MAX_RANGE_DAYS = 92;
/** Direct downloads stop here; a larger export must be generated as a report. */
export const EXPORT_MAX_ROWS = 10_000;
