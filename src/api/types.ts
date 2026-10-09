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
