import { describe, expect, it } from 'vitest';
import { ShiftRecord } from '../types';
import {
  formatDecimalHours,
  formatDuration,
  isOvernight,
  needsReview,
  parseTimeToMinutes,
  shiftMinutes,
  totalMinutes,
  totalsByEmployee,
} from './hours';

let nextId = 0;
function shift(employeeName: string, date: string, inTime: string, outTime: string, kind: 'Morning' | 'Evening' = 'Morning'): ShiftRecord {
  nextId += 1;
  return { id: `t${nextId}`, employeeName, date, shift: kind, inTime, outTime, submittedAt: '' };
}

// The logic the app used before Phase 0: round each shift to 0.1 h, then add the rounded values.
function oldRoundedHours(inTime: string, outTime: string): number {
  return Math.round((shiftMinutes(inTime, outTime) / 60) * 10) / 10;
}

describe('formatting', () => {
  it('formats 380 minutes as 6h 20m and 6.33', () => {
    expect(formatDuration(380)).toBe('6h 20m');
    expect(formatDecimalHours(380)).toBe('6.33');
  });

  it('drops zero parts', () => {
    expect(formatDuration(360)).toBe('6h');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('never produces NaN', () => {
    for (const bad of [NaN, Infinity, -5]) {
      expect(formatDuration(bad)).toBe('0m');
      expect(formatDecimalHours(bad)).toBe('0.00');
    }
  });
});

describe('shiftMinutes', () => {
  it('counts whole minutes between in and out', () => {
    expect(shiftMinutes('09:00', '15:20')).toBe(380);
    expect(shiftMinutes('16:00', '23:00')).toBe(420);
  });

  it('handles shifts past midnight', () => {
    expect(shiftMinutes('16:00', '00:30')).toBe(510);
    expect(shiftMinutes('23:00', '01:00')).toBe(120);
    expect(isOvernight('23:00', '01:00')).toBe(true);
    expect(isOvernight('09:00', '17:00')).toBe(false);
  });

  it('gives 0 and flags identical times for review', () => {
    expect(shiftMinutes('09:00', '09:00')).toBe(0);
    expect(needsReview('09:00', '09:00')).toBe(true);
  });

  it('gives 0 and flags missing or invalid times, never NaN', () => {
    const cases: Array<[string, string]> = [
      ['', '16:00'],
      ['09:00', ''],
      ['9am', '16:00'],
      ['24:00', '16:00'],
      ['12:60', '16:00'],
      ['abc', 'def'],
    ];
    for (const [inTime, outTime] of cases) {
      const minutes = shiftMinutes(inTime, outTime);
      expect(minutes).toBe(0);
      expect(Number.isNaN(minutes)).toBe(false);
      expect(needsReview(inTime, outTime)).toBe(true);
    }
  });

  it('accepts single-digit hours', () => {
    expect(parseTimeToMinutes('9:05')).toBe(545);
    expect(needsReview('9:00', '15:00')).toBe(false);
  });
});

describe('totals', () => {
  it('31 shifts of 6h 20m add up to exactly 196h 20m', () => {
    const records = Array.from({ length: 31 }, (_, i) => shift('Alex Demo', `2026-10-${String(i + 1).padStart(2, '0')}`, '09:00', '15:20'));
    const total = totalMinutes(records);
    expect(total).toBe(11780);
    expect(formatDuration(total)).toBe('196h 20m');
    expect(formatDecimalHours(total)).toBe('196.33');
  });

  it('regression: the old round-then-sum logic underpaid that month by 62 minutes', () => {
    const exact = 31 * shiftMinutes('09:00', '15:20');
    const oldHours = Array.from({ length: 31 }, () => oldRoundedHours('09:00', '15:20')).reduce((a, b) => a + b, 0);
    expect(Math.round(oldHours * 10) / 10).toBe(195.3);
    expect(exact - Math.round(oldHours * 60)).toBe(62);
  });

  it('groups totals per employee and counts shifts needing review', () => {
    const records = [
      shift('Sam Demo', '2026-10-01', '09:00', '15:20'),
      shift('Alex Demo', '2026-10-01', '16:00', '23:00', 'Evening'),
      shift('Sam Demo', '2026-10-02', '09:00', '16:05'),
      shift('Alex Demo', '2026-10-02', '', '23:00', 'Evening'),
    ];
    expect(totalsByEmployee(records)).toEqual([
      { employeeName: 'Alex Demo', minutes: 420, shifts: 2, needsReview: 1 },
      { employeeName: 'Sam Demo', minutes: 805, shifts: 2, needsReview: 0 },
    ]);
  });
});
