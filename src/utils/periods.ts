// Semi-monthly pay periods: 1st-15th and 16th-end of month (DECISIONS D-011).
export type PayPeriod = 'full' | 'first' | 'second';

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Inclusive first and last day of the period for a month (month is 1-12). */
export function periodDayRange(year: number, month: number, period: PayPeriod): [number, number] {
  const lastDay = daysInMonth(year, month);
  if (period === 'first') return [1, 15];
  if (period === 'second') return [16, lastDay];
  return [1, lastDay];
}

/** Records whose "YYYY-MM-DD" date falls inside the period's day range. */
export function recordsInPeriod<T extends { date: string }>(records: T[], year: number, month: number, period: PayPeriod): T[] {
  const [start, end] = periodDayRange(year, month, period);
  return records.filter((r) => {
    const day = Number(r.date.slice(8, 10));
    return day >= start && day <= end;
  });
}
