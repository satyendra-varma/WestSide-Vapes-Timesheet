// Builds a fake spreadsheet that looks like the real one, with FAKE names only.
import { randomInt } from 'node:crypto';
import { Backend } from './loadBackend';

export interface SeedEmployee { name: string; role?: 'manager' | 'staff'; active?: boolean; email?: string }

export const MONTH_HEADER_ROWS = [
  ['Date', 'Morning', '', '', '', 'Evening', '', '', ''],
  ['', 'Employee Name', 'In', 'Out', 'Hours', 'Employee Name', 'In', 'Out', 'Hours'],
];

/** Template tab + Employees tab (+ optional Active/Role/Email columns) + Timetable tab. */
export function seedSheets(backend: Backend, employees: SeedEmployee[], options: { employeeColumns?: boolean } = {}): void {
  const book = backend.google.spreadsheet;
  const template = book.insertSheet('Template');
  MONTH_HEADER_ROWS.forEach((row) => template.appendRow(row));

  const sheet = book.insertSheet('Employees');
  const withColumns = options.employeeColumns ?? true;
  sheet.appendRow(withColumns ? ['Employee Name', 'Active', 'Role', 'Email'] : ['Employee Name']);
  employees.forEach((e) => {
    sheet.appendRow(withColumns ? [e.name, e.active === false ? 'FALSE' : 'TRUE', e.role ?? 'staff', e.email ?? ''] : [e.name]);
  });

  const timetable = book.insertSheet('Timetable');
  timetable.appendRow(['Day', 'Morning', 'Evening']);
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach((d) => timetable.appendRow([d, '', '']));
}

/** A random 6-digit PIN the backend accepts (not a repeated digit or a straight run). */
export function randomPin(backend: Backend): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!backend.run<boolean>('isWeakPin', pin)) return pin;
  }
}

/** The owner's one-time setup: temporary script properties, then setManagerPin(). */
export function setupManager(backend: Backend, name: string, pin: string): void {
  backend.google.properties.setProperty('SETUP_MANAGER_NAME', name);
  backend.google.properties.setProperty('SETUP_MANAGER_PIN', pin);
  backend.run('setManagerPin');
}

export function login(backend: Backend, name: string, pin: string): string {
  const res = backend.post({ action: 'login', name, pin });
  if (res.status !== 'success') throw new Error(`login failed for ${name}: ${res.code} ${res.message}`);
  return (res.data as { token: string }).token;
}

export interface SeededWorld { managerName: string; managerPin: string; managerToken: string; staff: Record<string, string> }

/** Manager + staff with random PINs, all logged-in-able. */
export function seedWorld(backend: Backend, staffNames: string[] = ['Alex Demo', 'Sam Demo'], managerName = 'Morgan Demo'): SeededWorld {
  seedSheets(backend, [{ name: managerName, role: 'staff' }, ...staffNames.map((name) => ({ name }))]);
  const managerPin = randomPin(backend);
  setupManager(backend, managerName, managerPin);
  const managerToken = login(backend, managerName, managerPin);
  const staff: Record<string, string> = {};
  for (const name of staffNames) {
    const pin = randomPin(backend);
    const res = backend.post({ action: 'setPin', token: managerToken, name, pin });
    if (res.status !== 'success') throw new Error(`setPin failed: ${res.message}`);
    staff[name] = pin;
  }
  return { managerName, managerPin, managerToken, staff };
}
