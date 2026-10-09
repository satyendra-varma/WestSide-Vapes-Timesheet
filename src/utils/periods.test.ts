import { describe, expect, it } from 'vitest';
import { ShiftRecord } from '../types';
import { totalMinutes } from './hours';
import { daysInMonth, periodDayRange, recordsInPeriod } from './periods';

function day(d: number): ShiftRecord {
  const date = `2026-10-${String(d).padStart(2, '0')}`;
  return { id: date, employeeName: 'Alex Demo', date, shift: 'Morning', inTime: '09:00', outTime: '15:20', submittedAt: '' };
}

describe('semi-monthly pay periods', () => {
  it('knows month lengths, including leap years', () => {
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('splits on the 15th and ends on the last day of the month', () => {
    expect(periodDayRange(2026, 10, 'first')).toEqual([1, 15]);
    expect(periodDayRange(2026, 10, 'second')).toEqual([16, 31]);
    expect(periodDayRange(2026, 2, 'second')).toEqual([16, 28]);
    expect(periodDayRange(2026, 9, 'full')).toEqual([1, 30]);
  });

  it('puts day 15 in the first half and day 16 in the second', () => {
    const records = [day(1), day(15), day(16), day(31)];
    expect(recordsInPeriod(records, 2026, 10, 'first').map((r) => r.date)).toEqual(['2026-10-01', '2026-10-15']);
    expect(recordsInPeriod(records, 2026, 10, 'second').map((r) => r.date)).toEqual(['2026-10-16', '2026-10-31']);
  });

  it('the two halves add up to the full month exactly', () => {
    const records = Array.from({ length: 31 }, (_, i) => day(i + 1));
    const first = totalMinutes(recordsInPeriod(records, 2026, 10, 'first'));
    const second = totalMinutes(recordsInPeriod(records, 2026, 10, 'second'));
    expect(first).toBe(15 * 380);
    expect(second).toBe(16 * 380);
    expect(first + second).toBe(totalMinutes(recordsInPeriod(records, 2026, 10, 'full')));
  });
});
