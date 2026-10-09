import { ShiftRecord } from '../types';

// Shift lengths are tracked in whole minutes. Rounding each shift to decimal
// hours and then adding those up drifts the total (6h 20m -> 6.3h drops 2 minutes
// on every shift), so hours are only derived from a minute total at display time.

/** "HH:mm" -> minutes after midnight, or null if it isn't a valid time. */
export function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** Shifts longer than this get a "double-check the times" warning. */
export const LONG_SHIFT_MINUTES = 12 * 60;

/** True when the out time is earlier than the in time (counted as past midnight). */
export function isOvernight(inTime: string, outTime: string): boolean {
  const start = parseTimeToMinutes(inTime);
  const end = parseTimeToMinutes(outTime);
  return start !== null && end !== null && end < start;
}

/** Whole minutes worked between two "HH:mm" times; 0 if either time is missing or invalid. */
export function shiftMinutes(inTime: string, outTime: string): number {
  const start = parseTimeToMinutes(inTime);
  const end = parseTimeToMinutes(outTime);
  if (start === null || end === null) return 0;
  return end >= start ? end - start : end + 24 * 60 - start;
}

/** Missing, invalid or identical times give 0 minutes; such shifts must be fixed before payroll. */
export function needsReview(inTime: string, outTime: string): boolean {
  return shiftMinutes(inTime, outTime) === 0;
}

/** 380 -> "6h 20m", 360 -> "6h", 45 -> "45m" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/** 380 -> "6.33". Only format a final minute total; never add these strings up. */
export function formatDecimalHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '0.00';
  return (minutes / 60).toFixed(2);
}

export interface EmployeeTotal {
  employeeName: string;
  minutes: number;
  shifts: number;
  /** Shifts with missing or zero-length times; they add 0 minutes until fixed. */
  needsReview: number;
}

export function totalMinutes(records: ShiftRecord[]): number {
  return records.reduce((sum, r) => sum + shiftMinutes(r.inTime, r.outTime), 0);
}

export function totalsByEmployee(records: ShiftRecord[]): EmployeeTotal[] {
  const totals = new Map<string, EmployeeTotal>();
  for (const r of records) {
    const total = totals.get(r.employeeName) ?? { employeeName: r.employeeName, minutes: 0, shifts: 0, needsReview: 0 };
    const minutes = shiftMinutes(r.inTime, r.outTime);
    total.minutes += minutes;
    total.shifts += 1;
    if (minutes === 0) total.needsReview += 1;
    totals.set(r.employeeName, total);
  }
  return Array.from(totals.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}
