// Phase 4: edits and deletes based on what the user saw, audit detail, shared roster.
import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, seedWorld, SeededWorld } from '../../mock-backend/seed';

let backend: Backend;
let world: SeededWorld;
let alex: string;

const base = { action: 'saveShift', date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20' };
const slot = () =>
  (backend.post({ action: 'getTimesheet', token: world.managerToken, monthYear: '10-2026' }).data as { records: Array<Record<string, string>> }).records[0];
const auditRows = () => backend.google.spreadsheet.getSheetByName('Audit')!.dump().map((r) => r.slice(1).join(' | '));

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
  alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
  backend.post({ ...base, token: alex });
});

describe('edits are based on what the user saw', () => {
  it('an edit with matching expectedPrevious goes through', () => {
    const res = backend.post({ ...base, token: world.managerToken, outTime: '15:40', forceOverwrite: true, expectedPrevious: { name: 'Alex Demo', inTime: '09:00', outTime: '15:20' } });
    expect(res.status).toBe('success');
    expect(slot().outTime).toBe('15:40');
  });

  it('an edit made after someone else changed the slot is a conflict, even with forceOverwrite', () => {
    // Alex corrects their own shift on their phone...
    backend.post({ ...base, token: alex, outTime: '16:00', forceOverwrite: true });
    // ...while the manager's edit dialog still shows the old 15:20.
    const res = backend.post({ ...base, token: world.managerToken, name: 'Sam Demo', forceOverwrite: true, expectedPrevious: { name: 'Alex Demo', inTime: '09:00', outTime: '15:20' } });
    expect(res.status).toBe('conflict');
    expect(res.previousData).toEqual({ name: 'Alex Demo', inTime: '09:00', outTime: '16:00' });
    expect(slot()).toMatchObject({ name: 'Alex Demo', outTime: '16:00' });
  });

  it('name comparison ignores case and spacing', () => {
    const res = backend.post({ ...base, token: world.managerToken, outTime: '15:30', forceOverwrite: true, expectedPrevious: { name: ' alex  DEMO ', inTime: '09:00', outTime: '15:20' } });
    expect(res.status).toBe('success');
  });

  it('a delete of a slot that changed since it was loaded is a conflict and deletes nothing', () => {
    backend.post({ ...base, token: alex, outTime: '16:00', forceOverwrite: true });
    const res = backend.post({ action: 'deleteShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', expected: { name: 'Alex Demo', inTime: '09:00', outTime: '15:20' } });
    expect(res.status).toBe('conflict');
    expect(slot()).toMatchObject({ outTime: '16:00' });
    const ok = backend.post({ action: 'deleteShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning', expected: { name: 'Alex Demo', inTime: '09:00', outTime: '16:00' } });
    expect(ok.status).toBe('success');
  });
});

describe('audit trail: who, when, what changed', () => {
  it('records create, update (old -> new) and delete with the acting user and a timestamp', () => {
    backend.post({ ...base, token: world.managerToken, name: 'Sam Demo', outTime: '16:00', forceOverwrite: true });
    backend.post({ action: 'deleteShift', token: world.managerToken, date: '2026-10-08', shift: 'Morning' });
    const rows = auditRows();
    expect(rows).toContain('Alex Demo | shift.create | 2026-10-08 Morning | Alex Demo 09:00-15:20');
    expect(rows).toContain('Morgan Demo | shift.update | 2026-10-08 Morning | Sam Demo 09:00-16:00 (was: Alex Demo 09:00-15:20)');
    expect(rows).toContain('Morgan Demo | shift.delete | 2026-10-08 Morning | was: Sam Demo 09:00-16:00');
    const timestamps = backend.google.spreadsheet.getSheetByName('Audit')!.dump().slice(1).map((r) => String(r[0]));
    for (const t of timestamps) expect(t).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('an unchanged resubmission writes no audit row', () => {
    const before = auditRows().length;
    backend.post({ ...base, token: alex });
    expect(auditRows().length).toBe(before);
  });
});

describe('roster is shared through the sheet', () => {
  it('a change by the manager is what every other session reads next', () => {
    backend.post({ action: 'updateTimetable', token: world.managerToken, timetable: [{ dayName: 'Friday', morning: 'Alex Demo', evening: 'Sam Demo' }] });
    const sam = login(backend, 'Sam Demo', world.staff['Sam Demo']);
    for (const token of [alex, sam, world.managerToken]) {
      const days = backend.post({ action: 'getTimetable', token }).data as Array<{ dayName: string; morning: string; evening: string }>;
      expect(days[5]).toEqual({ dayName: 'Friday', morning: 'Alex Demo', evening: 'Sam Demo' });
    }
  });

  it('clearing a slot persists as blank', () => {
    backend.post({ action: 'updateTimetable', token: world.managerToken, timetable: [{ dayName: 'Friday', morning: 'Alex Demo', evening: '' }] });
    const days = backend.post({ action: 'getTimetable', token: alex }).data as Array<{ evening: string }>;
    expect(days[5].evening).toBe('');
  });
});
