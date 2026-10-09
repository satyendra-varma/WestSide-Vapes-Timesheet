import { describe, expect, it } from 'vitest';
import { ShiftRecord } from '../types';
import { csvCell, neutralizeFormula, shiftsCsv, summaryCsv, toCsv } from './csv';
import { totalsByEmployee } from './hours';

const rec = (date: string, shift: 'Morning' | 'Evening', employeeName: string, inTime: string, outTime: string): ShiftRecord =>
  ({ id: `${date}${shift}`, employeeName, date, shift, inTime, outTime });

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('CSV formula-injection guard', () => {
  it.each(['=SUM(A1)', '+1', '-1+1', '@cmd', '\tx', '\rx'])('prefixes %j with a quote', (value) => {
    expect(neutralizeFormula(value)).toBe(`'${value}`);
  });

  it('leaves ordinary text and numbers alone', () => {
    expect(neutralizeFormula('Alex Demo')).toBe('Alex Demo');
    expect(neutralizeFormula('09:00')).toBe('09:00');
    expect(csvCell(380)).toBe('380');
  });

  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('Lee, Jordan')).toBe('"Lee, Jordan"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it('writes a BOM and CRLF line endings', () => {
    const csv = toCsv([['a', 'b'], [1, 2]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿a,b\r\n1,2\r\n');
  });
});

describe('payroll CSVs', () => {
  const records = [
    rec('2026-10-02', 'Evening', 'Sam Demo', '16:00', '23:00'),
    rec('2026-10-01', 'Morning', 'Alex Demo', '09:00', '15:20'),
    rec('2026-10-01', 'Evening', 'Alex Demo', '', '23:00'),
    rec('2026-10-02', 'Morning', '=Evil Demo', '09:00', '16:05'),
  ];

  it('summary rows carry exact minutes, h:mm, decimal and review counts, plus an all-staff total', () => {
    const rows = lines(summaryCsv(totalsByEmployee(records), 'Oct 1–15, 2026'));
    expect(rows).toEqual([
      'Period,Employee,Shifts,Minutes,Hours (h:mm),Hours (decimal),Shifts needing review',
      `"Oct 1–15, 2026",'=Evil Demo,1,425,7h 5m,7.08,0`,
      '"Oct 1–15, 2026",Alex Demo,2,380,6h 20m,6.33,1',
      '"Oct 1–15, 2026",Sam Demo,1,420,7h,7.00,0',
      '"Oct 1–15, 2026",All staff,4,1225,20h 25m,20.42,1',
    ]);
  });

  it('daily rows are sorted by date, Morning before Evening, with per-shift minutes', () => {
    const rows = lines(shiftsCsv(records));
    expect(rows).toEqual([
      'Date,Shift,Employee,In,Out,Minutes,Hours (h:mm),Hours (decimal),Needs review',
      '2026-10-01,Morning,Alex Demo,09:00,15:20,380,6h 20m,6.33,',
      '2026-10-01,Evening,Alex Demo,,23:00,0,0m,0.00,yes',
      "2026-10-02,Morning,'=Evil Demo,09:00,16:05,425,7h 5m,7.08,",
      '2026-10-02,Evening,Sam Demo,16:00,23:00,420,7h,7.00,',
    ]);
  });

  it('the summary total equals the sum of the daily minutes (no rounding drift)', () => {
    const daily = lines(shiftsCsv(records)).slice(1).map((l) => Number(l.split(',')[5]));
    const total = Number(lines(summaryCsv(totalsByEmployee(records), 'x')).pop()!.split(',')[3]);
    expect(daily.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
