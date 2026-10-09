// Shapes of the v2 backend contract (docs/PROJECT.md -> Apps Script contract).

export type Role = 'manager' | 'staff';
export type ShiftType = 'Morning' | 'Evening';

export interface SessionUser {
  name: string;
  role: Role;
}

export interface LoginResult {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

export interface EmployeeInfo {
  name: string;
  role: Role;
  active: boolean;
  /** Manager view only. */
  hasPin?: boolean;
  /** Manager view only: epoch ms while locked, otherwise 0. */
  lockedUntil?: number;
}

export interface ShiftSlot {
  name: string;
  inTime: string;
  outTime: string;
}

export interface TimesheetRecordDto extends ShiftSlot {
  date: string;
  shift: ShiftType;
}

export interface TimesheetResult {
  monthYear: string;
  records: TimesheetRecordDto[];
}

export interface SaveShiftInput {
  date: string;
  shift: ShiftType;
  name: string;
  inTime: string;
  outTime: string;
  forceOverwrite?: boolean;
  /** For edits: the slot as the user saw it. If the sheet changed since, the server returns a conflict. */
  expectedPrevious?: ShiftSlot;
}

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  details: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
}

export type StockStatus = 'low' | 'out';

export interface StockItem {
  id: string;
  product: string;
  status: StockStatus;
  notedBy: string;
  notedAt: string;
  resolved: boolean;
  resolvedBy: string;
  resolvedAt: string;
}

export type RequestStatus = 'open' | 'contacted' | 'fulfilled';

/** Customer data: keep in React state only (DECISIONS D-016). */
export interface CustomerRequest {
  id: string;
  createdAt: string;
  customerName: string;
  phone: string;
  product: string;
  status: RequestStatus;
  statusChangedAt: string;
  statusChangedBy: string;
  createdBy: string;
}

export interface CashCount {
  date: string;
  countedBy: string;
  updatedAt: string;
  /** Pieces per denomination, keyed by value in cents ("10000" … "5"). */
  counts: Record<string, number>;
  totalCents: number;
  floatCents: number;
  differenceCents: number;
}

export interface CashDay {
  date: string;
  /** Current target float (integer cents). */
  floatCents: number;
  count: CashCount | null;
}

export interface RosterDay {
  dayName: string;
  morning: string;
  evening: string;
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'locked'
  | 'invalid_credentials'
  | 'invalid'
  | 'conflict'
  | 'not_found'
  | 'busy'
  | 'server_error'
  | 'network'
  | 'bad_backend'
  | 'not_configured';
