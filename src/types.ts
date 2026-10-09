export type ShiftType = 'Morning' | 'Evening';

export interface Employee {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
}

export interface ShiftRecord {
  id: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  inTime: string; // HH:mm
  outTime: string; // HH:mm
  // No stored hours field: always derive minutes from inTime/outTime (see utils/hours.ts)
  submittedAt: string; // ISO string
  notes?: string;
}

export interface TimetableShift {
  employeeName: string;
  note?: string;
}

export interface DaySchedule {
  dayName: string; // 'Sunday', 'Monday', etc.
  dateStr: string; // YYYY-MM-DD
  morning: TimetableShift[];
  evening: TimetableShift[];
}

export interface ConflictCheckPayload {
  exists: boolean;
  previousRecord?: ShiftRecord;
  currentSubmission: Omit<ShiftRecord, 'id' | 'submittedAt'>;
}

export interface AppsScriptResponse<T = any> {
  success: boolean;
  action?: string;
  data?: T;
  message?: string;
  previousRecord?: ShiftRecord;
}
