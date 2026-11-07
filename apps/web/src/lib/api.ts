import type {
  BatchStatus,
  FlockPurpose,
  MortalityReason,
  RecordStatus,
  Role,
} from '@farmos/shared-types';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON fetch against the versioned API, sending the session cookie. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const issues = Array.isArray(body.issues)
      ? body.issues
          .map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
          .join('; ')
      : null;
    throw new ApiError(response.status, issues ?? body.message ?? response.statusText);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: Role;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Builds a query string, leaving out empty values. */
export function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface Farm {
  id: string;
  name: string;
  location: string | null;
  archivedAt: string | null;
  houseCount: number;
}

export interface House {
  id: string;
  name: string;
  capacity: number;
  archivedAt: string | null;
  farm: { id: string; name: string; archivedAt: string | null };
  activeBatch: {
    id: string;
    batchCode: string;
    breed: string;
    initialBirds: number;
    placementDate: string;
  } | null;
}

export interface FlockBatch {
  id: string;
  batchCode: string;
  breed: string;
  purpose: FlockPurpose;
  status: BatchStatus;
  placementDate: string;
  endDate: string | null;
  initialBirds: number;
  notes: string | null;
  ageDays: number | null;
  liveBirds: number;
  cumulativeMortalityPct: number;
  house: { id: string; name: string; farm: { id: string; name: string } };
}

export interface FeedType {
  id: string;
  name: string;
}

interface Person {
  id: string;
  name: string;
}

export interface ProductionLog {
  id: string;
  logDate: string;
  eggsCollected: number;
  waterLitres: number | null;
  notes: string | null;
  status: RecordStatus;
  creator: Person;
  approver: Person | null;
  approvedAt: string | null;
}

export interface FlockRecords {
  productionLogs: ProductionLog[];
  mortality: {
    id: string;
    eventDate: string;
    quantity: number;
    reasonCode: MortalityReason;
    notes: string | null;
    recorder: Person;
  }[];
  feed: {
    id: string;
    usageDate: string;
    quantityKg: number;
    feedType: FeedType;
    recorder: Person;
  }[];
  weightSamples: {
    id: string;
    sampleDate: string;
    sampleSize: number;
    averageWeightGrams: number;
    recorder: Person;
  }[];
}

/** One day of flock metrics; see docs/architecture/metrics.md. Null = not recorded. */
export interface DailyMetrics {
  date: string;
  ageDays: number;
  openingBirds: number;
  deaths: number;
  closingBirds: number;
  mortalityRatePct: number | null;
  cumulativeMortalityPct: number;
  eggs: number | null;
  henDayPct: number | null;
  feedKg: number | null;
  feedPerBirdKg: number | null;
  waterLitres: number | null;
  averageWeightGrams: number | null;
}
