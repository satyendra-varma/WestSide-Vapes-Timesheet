import { ShiftType } from './api/types';

export type { ShiftType } from './api/types';

export interface ShiftRecord {
  id: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  inTime: string; // HH:mm
  outTime: string; // HH:mm
  // No stored hours field: always derive minutes from inTime/outTime (see utils/hours.ts)
  submittedAt?: string;
}
