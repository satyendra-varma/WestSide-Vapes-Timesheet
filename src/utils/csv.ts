// CSV export for payroll (manager only). No money, only time worked (DECISIONS D-014).
import { CustomerRequest } from '../api/types';
import { ShiftRecord } from '../types';
import { EmployeeTotal, formatDecimalHours, formatDuration, needsReview, shiftMinutes } from './hours';

/**
 * Spreadsheet apps run cells that start with = + - @ (and tab / carriage return) as formulas.
 * Prefixing a single quote makes them inert text (OWASP "CSV injection").
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number): string {
  const text = neutralizeFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings and a UTF-8 BOM so Excel reads accented names correctly. */
export function toCsv(rows: Array<Array<string | number>>): string {
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function summaryCsv(totals: EmployeeTotal[], periodLabel: string): string {
  const rows: Array<Array<string | number>> = [
    ['Period', 'Employee', 'Shifts', 'Minutes', 'Hours (h:mm)', 'Hours (decimal)', 'Shifts needing review'],
  ];
  let minutes = 0;
  let shifts = 0;
  let review = 0;
  for (const t of totals) {
    rows.push([periodLabel, t.employeeName, t.shifts, t.minutes, formatDuration(t.minutes), formatDecimalHours(t.minutes), t.needsReview]);
    minutes += t.minutes;
    shifts += t.shifts;
    review += t.needsReview;
  }
  rows.push([periodLabel, 'All staff', shifts, minutes, formatDuration(minutes), formatDecimalHours(minutes), review]);
  return toCsv(rows);
}

export function shiftsCsv(records: ShiftRecord[]): string {
  const shiftOrder = (r: ShiftRecord) => (r.shift === 'Morning' ? 0 : 1);
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || shiftOrder(a) - shiftOrder(b));
  const rows: Array<Array<string | number>> = [
    ['Date', 'Shift', 'Employee', 'In', 'Out', 'Minutes', 'Hours (h:mm)', 'Hours (decimal)', 'Needs review'],
  ];
  for (const r of sorted) {
    const minutes = shiftMinutes(r.inTime, r.outTime);
    rows.push([r.date, r.shift, r.employeeName, r.inTime, r.outTime, minutes, formatDuration(minutes), formatDecimalHours(minutes), needsReview(r.inTime, r.outTime) ? 'yes' : '']);
  }
  return toCsv(rows);
}

/** Manager-only export of customer requests (DECISIONS D-041); same injection guard as above. */
export function requestsCsv(requests: CustomerRequest[]): string {
  const rows: Array<Array<string | number>> = [
    ['ID', 'Created', 'Customer name', 'Phone', 'Product', 'Status', 'Status changed', 'Changed by', 'Created by'],
  ];
  for (const r of [...requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    rows.push([r.id, r.createdAt, r.customerName, r.phone, r.product, r.status, r.statusChangedAt, r.statusChangedBy, r.createdBy]);
  }
  return toCsv(rows);
}

/** Saves a CSV through the browser's normal download. Nothing is stored by the app. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
