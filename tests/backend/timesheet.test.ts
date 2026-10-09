import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, seedWorld, SeededWorld } from '../../mock-backend/seed';

// Fake clock: 2026-10-09 13:00 in America/Vancouver.
let backend: Backend;
let world: SeededWorld;
let alex: string;
let sam: string;

const shift = (token: string, extra: Record<string, unknown> = {}) =>
  backend.post({ action: 'saveShift', token, date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20', ...extra });

const records = (token = world.managerToken, monthYear = '10-2026') =>
  (backend.post({ action: 'getTimesheet', token, monthYear }).data as { records: Array<Record<string, string>> }).records;

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
  alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
  sam = login(backend, 'Sam Demo', world.staff['Sam Demo']);
});

describe('saveShift', () => {
  it('creates the month tab from Template on the first write and stores the slot', () => {
    expect(backend.google.spreadsheet.getSheetByName('10-2026')).toBeNull();
    expect(shift(alex).status).toBe('success');
    const sheet = backend.google.spreadsheet.getSheetByName('10-2026')!;
    expect(sheet.protections[0]).toEqual({ description: 'Protected Monthly Sheet (10-2026)', warningOnly: true });
    expect(records()).toEqual([{ date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20' }]);
  });

  it('writes Evening shifts to columns F-H on row day + 2', () => {
    shift(alex, { date: '2026-10-01', shift: 'Evening', inTime: '16:00', outTime: '23:00' });
    const row = backend.google.spreadsheet.getSheetByName('10-2026')!.getRange(3, 6, 1, 3).getDisplayValues()[0];
    expect(row).toEqual(['Alex Demo', '16:00', '23:00']);
  });

  it('refuses to change an occupied slot without forceOverwrite and writes nothing', () => {
    shift(alex);
    const res = backend.post({ action: 'saveShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', name: 'Sam Demo', inTime: '09:00', outTime: '16:00' });
    expect(res.status).toBe('conflict');
    expect(res.previousData).toEqual({ name: 'Alex Demo', inTime: '09:00', outTime: '15:20' });
    expect(records()[0].name).toBe('Alex Demo');
  });

  it('identical resubmission is not a conflict', () => {
    shift(alex);
    expect(shift(alex).status).toBe('success');
  });

  it('manager can force-overwrite anyone', () => {
    shift(alex);
    const res = backend.post({ action: 'saveShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', name: 'Sam Demo', inTime: '09:00', outTime: '16:00', forceOverwrite: true });
    expect(res.status).toBe('success');
    expect(records()[0]).toMatchObject({ name: 'Sam Demo', outTime: '16:00' });
  });

  it('staff can correct their own shift but not replace someone else', () => {
    shift(alex);
    expect(shift(alex, { outTime: '15:40' }).status).toBe('conflict');
    expect(shift(alex, { outTime: '15:40', forceOverwrite: true }).status).toBe('success');
    const res = backend.post({ action: 'saveShift', token: sam, date: '2026-10-08', shift: 'Morning', name: 'Sam Demo', inTime: '09:00', outTime: '16:00', forceOverwrite: true });
    expect(res.code).toBe('forbidden');
    expect(records()[0]).toMatchObject({ name: 'Alex Demo', outTime: '15:40' });
  });

  it('staff can only log shifts under their own name', () => {
    expect(shift(sam).code).toBe('forbidden');
  });

  it('validates input', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ date: '2026-02-30' }, 'date'],
      [{ date: '10/08/2026' }, 'date'],
      [{ date: '2026-10-10' }, 'date'],
      [{ shift: 'Night' }, 'shift'],
      [{ inTime: '9am' }, 'inTime'],
      [{ outTime: '25:00' }, 'outTime'],
      [{ outTime: '09:00' }, 'outTime'],
      [{ name: 'Nobody Demo' }, 'name'],
    ];
    for (const [extra, field] of cases) {
      const res = backend.post({ action: 'saveShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20', ...extra });
      expect(res.code, JSON.stringify(extra)).toBe('invalid');
      expect(res.field, JSON.stringify(extra)).toBe(field);
    }
    expect(backend.google.spreadsheet.getSheetByName('10-2026')).toBeNull();
  });

  it('rejects inactive employees', () => {
    backend.post({ action: 'setEmployeeActive', token: world.managerToken, name: 'Sam Demo', active: false });
    const res = backend.post({ action: 'saveShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', name: 'Sam Demo', inTime: '09:00', outTime: '15:00' });
    expect(res.code).toBe('invalid');
  });

  it('audits creates and overwrites with old and new values', () => {
    shift(alex);
    shift(alex, { outTime: '15:40', forceOverwrite: true });
    const audit = backend.google.spreadsheet.getSheetByName('Audit')!.dump().map((r) => r.slice(1).join(' | '));
    expect(audit).toContain('Alex Demo | shift.create | 2026-10-08 Morning | Alex Demo 09:00-15:20');
    expect(audit).toContain('Alex Demo | shift.update | 2026-10-08 Morning | Alex Demo 09:00-15:40 (was: Alex Demo 09:00-15:20)');
  });
});

describe('getTimesheet', () => {
  it('returns [] for a month with no tab and does not create one', () => {
    expect(records(alex, '09-2026')).toEqual([]);
    expect(backend.google.spreadsheet.getSheetByName('09-2026')).toBeNull();
  });

  it('reads times stored as time values, text, numbers and AM/PM strings', () => {
    shift(alex, { date: '2026-10-01' });
    const sheet = backend.google.spreadsheet.getSheetByName('10-2026')!;
    sheet.getRange(4, 2, 1, 3).setValues([['Sam Demo', 0.375, "'4:30 PM"]]);
    expect(records()).toEqual([
      { date: '2026-10-01', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20' },
      { date: '2026-10-02', shift: 'Morning', name: 'Sam Demo', inTime: '09:00', outTime: '16:30' },
    ]);
  });

  it('keeps unreadable times as text so they are flagged, never guessed', () => {
    shift(alex, { date: '2026-10-01' });
    backend.google.spreadsheet.getSheetByName('10-2026')!.getRange(3, 3).setValue('nine-ish');
    expect(records()[0]).toMatchObject({ inTime: 'nine-ish', outTime: '15:20' });
  });

  it('ignores rows past the end of the month', () => {
    backend.post({ action: 'saveShift', token: world.managerToken, date: '2026-09-30', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:00' });
    backend.google.spreadsheet.getSheetByName('09-2026')!.getRange(33, 2, 1, 3).setValues([['Ghost Demo', '09:00', '10:00']]);
    expect(records(alex, '09-2026').map((r) => r.date)).toEqual(['2026-09-30']);
  });

  it('rejects malformed months', () => {
    expect(backend.post({ action: 'getTimesheet', token: alex, monthYear: '13-2026' }).code).toBe('invalid');
  });
});

describe('deleteShift', () => {
  it('is manager-only, clears the slot and is audited', () => {
    shift(alex);
    expect(backend.post({ action: 'deleteShift', token: alex, date: '2026-10-08', shift: 'Morning' }).code).toBe('forbidden');
    expect(backend.post({ action: 'deleteShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning' }).status).toBe('success');
    expect(records()).toEqual([]);
    const audit = JSON.stringify(backend.google.spreadsheet.getSheetByName('Audit')!.dump());
    expect(audit).toContain('shift.delete');
    expect(audit).toContain('was: Alex Demo 09:00-15:20');
  });

  it('reports a missing shift', () => {
    expect(backend.post({ action: 'deleteShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning' }).code).toBe('not_found');
  });
});

describe('timetable', () => {
  it('everyone can read it; only the manager can change it; names must be active employees', () => {
    const update = (token: string, morning: string) =>
      backend.post({ action: 'updateTimetable', token, timetable: [{ dayName: 'Monday', morning, evening: 'Sam Demo' }] });
    expect(update(alex, 'Alex Demo').code).toBe('forbidden');
    expect(update(world.managerToken, 'Nobody Demo').code).toBe('invalid');
    const res = update(world.managerToken, 'alex demo');
    expect(res.status).toBe('success');
    const days = backend.post({ action: 'getTimetable', token: alex }).data as Array<{ dayName: string; morning: string; evening: string }>;
    expect(days).toHaveLength(7);
    expect(days[1]).toEqual({ dayName: 'Monday', morning: 'Alex Demo', evening: 'Sam Demo' });
    expect(JSON.stringify(backend.google.spreadsheet.getSheetByName('Audit')!.dump())).toContain('timetable.update');
  });

  it('rejects unknown day names', () => {
    const res = backend.post({ action: 'updateTimetable', token: world.managerToken, timetable: [{ dayName: 'Funday', morning: '', evening: '' }] });
    expect(res.code).toBe('invalid');
  });
});
