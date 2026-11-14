import type {
  AlertRule,
  AssistantAnswer,
  Evidence,
  AlertStatus,
  BatchStatus,
  CorrectionStatus,
  FlockPurpose,
  HealthCategory,
  JobStatus,
  MortalityReason,
  MovementType,
  NotificationKind,
  RecordStatus,
  ReportParameters,
  ReportType,
  ReportTypeInfo,
  ResolutionStatus,
  Role,
  Severity,
  VaccinationStatus,
} from '@farmos/shared-types';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The API's id for the request, for matching a report to its log line. */
    readonly requestId?: string,
  ) {
    super(message);
  }
}

/**
 * What to show for a failed response. Server errors carry no useful detail, so
 * they get the request id instead, which support can look up in the logs.
 */
export function errorMessage(status: number, message: string, requestId?: string): string {
  if (status >= 500) {
    const reference = requestId ? ` (reference ${requestId.slice(0, 8)})` : '';
    return `Something went wrong on our side. Please try again${reference}.`;
  }
  return message;
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
    const requestId = response.headers.get('x-request-id') ?? undefined;
    throw new ApiError(
      response.status,
      errorMessage(response.status, issues ?? body.message ?? response.statusText, requestId),
      requestId,
    );
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

/** Voided records stay visible but no longer count towards any total. */
interface Voidable {
  voidedAt: string | null;
  voidReason: string | null;
  voider: Person | null;
}

export interface FlockRecords {
  productionLogs: ProductionLog[];
  mortality: (Voidable & {
    id: string;
    eventDate: string;
    quantity: number;
    reasonCode: MortalityReason;
    notes: string | null;
    recorder: Person;
  })[];
  feed: (Voidable & {
    id: string;
    usageDate: string;
    quantityKg: number;
    feedType: FeedType;
    recorder: Person;
  })[];
  weightSamples: (Voidable & {
    id: string;
    sampleDate: string;
    sampleSize: number;
    averageWeightGrams: number;
    recorder: Person;
  })[];
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

export interface Correction {
  id: string;
  proposedChanges: { eggsCollected?: number; waterLitres?: number | null; notes?: string | null };
  reason: string;
  status: CorrectionStatus;
  reviewNote: string | null;
  createdAt: string;
  requester: Person;
  reviewer: Person | null;
  productionLog: {
    id: string;
    logDate: string;
    eggsCollected: number;
    waterLitres: number | null;
    notes: string | null;
    batch: { id: string; batchCode: string };
  };
}

export interface Vaccine {
  id: string;
  name: string;
  recommendedIntervalDays: number | null;
}

export interface Vaccination {
  id: string;
  scheduledDate: string;
  administeredAt: string | null;
  status: VaccinationStatus;
  overdue?: boolean;
  vaccine: Vaccine;
  batch: { id: string; batchCode: string; status: BatchStatus };
  recorder: Person | null;
}

export interface HealthEvent {
  id: string;
  observedAt: string;
  category: HealthCategory;
  severity: Severity;
  description: string;
  resolutionStatus: ResolutionStatus;
  batch: { id: string; batchCode: string; status: BatchStatus };
  recorder: Person;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  reorderLevel: number | null;
}

export interface StockRow {
  item: { id: string; name: string; unit: string };
  farm: { id: string; name: string; archivedAt: string | null };
  balance: number;
  reorderLevel: number | null;
  belowReorder: boolean;
}

export interface InventoryMovement {
  id: string;
  movementType: MovementType;
  quantity: number;
  occurredAt: string;
  reference: string | null;
  transferId: string | null;
  item: { id: string; name: string; unit: string };
  farm: { id: string; name: string };
  recorder: Person;
}

/** Additive window totals; rates are derived from them, never averaged. */
export interface WindowTotals {
  days: number;
  startingBirds: number;
  deaths: number;
  eggs: number;
  layingBirdDays: number;
  daysWithEggs: number;
  feedKg: number;
  feedBirdDays: number;
  daysWithFeed: number;
}

export interface WindowKpis {
  henDayPct: number | null;
  mortalityPct: number | null;
  feedPerBirdKg: number | null;
}

export interface DateRangeResult {
  from: string;
  to: string;
}

export interface AnalyticsOverview {
  range: DateRangeResult;
  flocks: { active: number; liveBirds: number; inRange: number };
  production: { totals: WindowTotals; kpis: WindowKpis };
  health: { openEvents: number; vaccinationsDueThisWeek: number; vaccinationsOverdue: number };
  inventory: { lowStock: number };
  alerts: Partial<Record<Severity, number>>;
}

export interface CombinedDay {
  date: string;
  openingBirds: number;
  deaths: number;
  mortalityRatePct: number | null;
  eggs: number | null;
  henDayPct: number | null;
  feedKg: number | null;
  feedPerBirdKg: number | null;
}

export interface FarmComparison {
  range: DateRangeResult;
  farms: {
    farm: { id: string; name: string };
    flocks: number;
    birdsAtEnd: number;
    totals: WindowTotals;
    kpis: WindowKpis;
  }[];
}

export interface FlockSummary {
  flock: {
    id: string;
    batchCode: string;
    breed: string;
    purpose: FlockPurpose;
    status: BatchStatus;
    house: { id: string; name: string; farm: { id: string; name: string } };
  };
  days: number;
  birdsAtEnd: number | null;
  totals: WindowTotals;
  kpis: WindowKpis;
  fcr: number | null;
}

export interface Alert {
  id: string;
  ruleCode: AlertRule;
  severity: Severity;
  status: AlertStatus;
  details: Record<string, unknown> | null;
  createdAt: string;
  batch: { id: string; batchCode: string } | null;
  acknowledger: Person | null;
  resolver: Person | null;
}

export interface AssistantStatus {
  available: boolean;
  model: string | null;
  dailyQuestionLimit: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  /** Present on answers: the structured reply and the evidence behind it. */
  answer?: AssistantAnswer;
  evidence?: Evidence[];
}

export interface Conversation extends ConversationSummary {
  messages: AssistantMessage[];
}

export interface AskResult {
  conversation: ConversationSummary;
  messages: AssistantMessage[];
}

export interface ReportTypeOption extends ReportTypeInfo {
  type: ReportType;
}

export interface ReportJob {
  id: string;
  reportType: ReportType;
  parameters: ReportParameters;
  status: JobStatus;
  attempts: number;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  downloadable: boolean;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
