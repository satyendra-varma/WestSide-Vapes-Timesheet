import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, randomPin, seedSheets, seedWorld, setupManager, SeededWorld } from '../../mock-backend/seed';

let backend: Backend;
let world: SeededWorld;

function auditText(): string {
  const sheet = backend.google.spreadsheet.getSheetByName('Audit');
  return sheet ? JSON.stringify(sheet.dump()) : '';
}

function everythingStored(): string {
  const sheets = backend.google.spreadsheet.sheets.map((s) => JSON.stringify(s.dump())).join('\n');
  return `${sheets}\n${JSON.stringify(backend.google.properties.getProperties())}\n${backend.google.logs.join('\n')}`;
}

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
});

describe('login', () => {
  it('returns a token, expiry and the user with role', () => {
    const pin = world.staff['Alex Demo'];
    const res = backend.post({ action: 'login', name: 'alex  demo', pin });
    expect(res.status).toBe('success');
    const data = res.data as { token: string; expiresAt: number; user: { name: string; role: string } };
    expect(data.user).toEqual({ name: 'Alex Demo', role: 'staff' });
    expect(data.token.split('.')).toHaveLength(2);
    expect(data.expiresAt - backend.google.clock.nowMs).toBe(8 * 60 * 60 * 1000);
  });

  it('gives the manager a shorter session', () => {
    const res = backend.post({ action: 'login', name: world.managerName, pin: world.managerPin });
    const data = res.data as { expiresAt: number; user: { role: string } };
    expect(data.user.role).toBe('manager');
    expect(data.expiresAt - backend.google.clock.nowMs).toBe(2 * 60 * 60 * 1000);
  });

  it('answers wrong PIN, unknown name and malformed PIN with the same generic error', () => {
    const wrong = backend.post({ action: 'login', name: 'Alex Demo', pin: '000001' });
    const unknown = backend.post({ action: 'login', name: 'Nobody Here', pin: world.staff['Alex Demo'] });
    const malformed = backend.post({ action: 'login', name: 'Alex Demo', pin: '12ab' });
    for (const res of [wrong, unknown, malformed]) {
      expect(res.status).toBe('error');
      expect(res.code).toBe('invalid_credentials');
      expect(res.message).toBe('Name or PIN is incorrect.');
    }
  });

  it('rejects an employee who has no PIN yet', () => {
    const fresh = createBackend();
    seedSheets(fresh, [{ name: 'Morgan Demo' }, { name: 'New Demo' }]);
    setupManager(fresh, 'Morgan Demo', randomPin(fresh));
    expect(fresh.post({ action: 'login', name: 'New Demo', pin: '135790' }).code).toBe('invalid_credentials');
  });
});

describe('lockout', () => {
  it('locks after 5 wrong PINs for 15 minutes, even for the right PIN', () => {
    const pin = world.staff['Sam Demo'];
    for (let i = 0; i < 4; i++) expect(backend.post({ action: 'login', name: 'Sam Demo', pin: '000001' }).code).toBe('invalid_credentials');
    const fifth = backend.post({ action: 'login', name: 'Sam Demo', pin: '000001' });
    expect(fifth.code).toBe('locked');
    expect(fifth.retryAfterMinutes).toBe(15);
    expect(backend.post({ action: 'login', name: 'Sam Demo', pin }).code).toBe('locked');

    backend.google.clock.advanceMinutes(14);
    expect(backend.post({ action: 'login', name: 'Sam Demo', pin }).code).toBe('locked');
    backend.google.clock.advanceMinutes(2);
    expect(backend.post({ action: 'login', name: 'Sam Demo', pin }).status).toBe('success');
  });

  it('a successful login resets the failure count', () => {
    const pin = world.staff['Sam Demo'];
    for (let i = 0; i < 4; i++) backend.post({ action: 'login', name: 'Sam Demo', pin: '000001' });
    expect(backend.post({ action: 'login', name: 'Sam Demo', pin }).status).toBe('success');
    for (let i = 0; i < 4; i++) expect(backend.post({ action: 'login', name: 'Sam Demo', pin: '000001' }).code).toBe('invalid_credentials');
  });

  it('the manager can unlock; staff cannot', () => {
    const pin = world.staff['Sam Demo'];
    for (let i = 0; i < 5; i++) backend.post({ action: 'login', name: 'Sam Demo', pin: '000001' });
    const alexToken = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    expect(backend.post({ action: 'unlockEmployee', token: alexToken, name: 'Sam Demo' }).code).toBe('forbidden');

    const list = backend.post({ action: 'getEmployees', token: world.managerToken }).data as Array<{ name: string; lockedUntil: number }>;
    expect(list.find((e) => e.name === 'Sam Demo')?.lockedUntil).toBeGreaterThan(backend.google.clock.nowMs);

    expect(backend.post({ action: 'unlockEmployee', token: world.managerToken, name: 'Sam Demo' }).status).toBe('success');
    expect(backend.post({ action: 'login', name: 'Sam Demo', pin }).status).toBe('success');
  });

  it('records auth events in the Audit tab without PINs', () => {
    backend.post({ action: 'login', name: 'Sam Demo', pin: '000001' });
    const text = auditText();
    expect(text).toContain('login.failed');
    expect(text).toContain('login.success');
    expect(text).toContain('pin.set');
    expect(text).not.toContain('000001');
    for (const pin of [world.managerPin, ...Object.values(world.staff)]) expect(text).not.toContain(pin);
  });
});

describe('tokens', () => {
  const read = (token: unknown) => backend.post({ action: 'getEmployees', token });

  it('accepts a fresh token', () => {
    expect(read(world.managerToken).status).toBe('success');
  });

  it('rejects missing, garbage and tampered tokens', () => {
    const [body, sig] = world.managerToken.split('.');
    const payload = JSON.parse(decodeURIComponent(body)) as Record<string, unknown>;
    const forgedBody = encodeURIComponent(JSON.stringify({ ...payload, n: 'Alex Demo' }));
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    for (const token of [undefined, '', 'abc', 'a.b.c', `${forgedBody}.${sig}`, `${body}.${flipped}`, 42]) {
      expect(read(token).code).toBe('unauthorized');
    }
  });

  it('rejects a token signed with another secret', () => {
    const other = createBackend();
    const otherWorld = seedWorld(other);
    expect(read(otherWorld.managerToken).code).toBe('unauthorized');
  });

  it('expires', () => {
    const staffToken = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    backend.google.clock.advanceMinutes(8 * 60 - 1);
    expect(read(staffToken).status).toBe('success');
    backend.google.clock.advanceMinutes(2);
    expect(read(staffToken).code).toBe('unauthorized');
  });

  it('dies when the PIN is reset', () => {
    const staffToken = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    backend.post({ action: 'setPin', token: world.managerToken, name: 'Alex Demo', pin: randomPin(backend) });
    expect(read(staffToken).code).toBe('unauthorized');
  });

  it('never stores PINs or tokens in the sheet, properties or logs', () => {
    const stored = everythingStored();
    for (const pin of [world.managerPin, ...Object.values(world.staff)]) expect(stored).not.toContain(pin);
    expect(stored).not.toContain(world.managerToken.split('.')[1]);
  });
});

describe('active flag', () => {
  it('deactivation kills existing sessions and blocks login', () => {
    const staffToken = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    const res = backend.post({ action: 'setEmployeeActive', token: world.managerToken, name: 'Alex Demo', active: false });
    expect(res.status).toBe('success');
    expect(read()).toBe('unauthorized');
    expect(backend.post({ action: 'login', name: 'Alex Demo', pin: world.staff['Alex Demo'] }).code).toBe('invalid_credentials');

    function read(): string | undefined {
      return backend.post({ action: 'getTimesheet', token: staffToken, monthYear: '10-2026' }).code;
    }
  });

  it('is checked on every request, even when the sheet is edited by hand', () => {
    const staffToken = login(backend, 'Sam Demo', world.staff['Sam Demo']);
    const sheet = backend.google.spreadsheet.getSheetByName('Employees');
    const row = sheet!.dump().findIndex((r) => r[0] === 'Sam Demo') + 1;
    sheet!.getRange(row, 2).setValue('FALSE');
    expect(backend.post({ action: 'getTimetable', token: staffToken }).code).toBe('unauthorized');
  });

  it("the manager can't deactivate themselves", () => {
    const res = backend.post({ action: 'setEmployeeActive', token: world.managerToken, name: world.managerName, active: false });
    expect(res.code).toBe('invalid');
  });

  it('reactivation lets the employee log in again', () => {
    backend.post({ action: 'setEmployeeActive', token: world.managerToken, name: 'Alex Demo', active: false });
    backend.post({ action: 'setEmployeeActive', token: world.managerToken, name: 'Alex Demo', active: true });
    expect(backend.post({ action: 'login', name: 'Alex Demo', pin: world.staff['Alex Demo'] }).status).toBe('success');
  });
});

describe('roles', () => {
  it('demoting the manager in the sheet takes effect on the next request', () => {
    const sheet = backend.google.spreadsheet.getSheetByName('Employees')!;
    sheet.getRange(2, 3).setValue('staff');
    expect(backend.post({ action: 'setPin', token: world.managerToken, name: 'Alex Demo', pin: randomPin(backend) }).code).toBe('forbidden');
  });

  it('staff are forbidden from every manager action', () => {
    const staffToken = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    const managerOnly: Array<Record<string, unknown>> = [
      { action: 'setPin', name: 'Sam Demo', pin: '135790' },
      { action: 'unlockEmployee', name: 'Sam Demo' },
      { action: 'setEmployeeActive', name: 'Sam Demo', active: false },
      { action: 'updateTimetable', timetable: [] },
      { action: 'deleteShift', date: '2026-10-01', shift: 'Morning' },
    ];
    for (const body of managerOnly) expect(backend.post({ ...body, token: staffToken }).code).toBe('forbidden');
  });

  it('staff only see active names; the manager sees PIN and lock status', () => {
    backend.post({ action: 'setEmployeeActive', token: world.managerToken, name: 'Sam Demo', active: false });
    const staffToken = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    const staffView = backend.post({ action: 'getEmployees', token: staffToken }).data as Array<Record<string, unknown>>;
    expect(staffView.map((e) => e.name)).toEqual(['Morgan Demo', 'Alex Demo']);
    expect(Object.keys(staffView[0]).sort()).toEqual(['active', 'name', 'role']);
    const managerView = backend.post({ action: 'getEmployees', token: world.managerToken }).data as Array<Record<string, unknown>>;
    expect(managerView).toHaveLength(3);
    expect(managerView[2]).toMatchObject({ name: 'Sam Demo', active: false, hasPin: true });
  });
});

describe('no data without a token', () => {
  it('every action except login is refused', () => {
    for (const action of ['getEmployees', 'getTimesheet', 'getTimetable', 'saveShift', 'deleteShift', 'updateTimetable', 'setPin', 'unlockEmployee', 'setEmployeeActive']) {
      const res = backend.post({ action, monthYear: '10-2026' });
      expect(res.code, action).toBe('unauthorized');
      expect(res.data, action).toBeUndefined();
    }
  });

  it('GET returns no data, only the API version', () => {
    expect(backend.get()).toEqual({ status: 'error', code: 'use_post', message: 'This backend only accepts POST requests.', apiVersion: 2 });
  });

  it('rejects unknown actions and non-JSON bodies', () => {
    expect(backend.post({ action: 'toString' }).code).toBe('invalid');
    expect(backend.postRaw('not json').code).toBe('invalid');
  });
});

describe('PIN rules', () => {
  it('setPin requires 6 digits and rejects easy PINs', () => {
    for (const pin of ['12345', '1234567', 'abcdef', '111111', '123456', '987654']) {
      const res = backend.post({ action: 'setPin', token: world.managerToken, name: 'Alex Demo', pin });
      expect(res.code, pin).toBe('invalid');
    }
  });

  it('setManagerPin deletes the temporary properties and rejects unknown names', () => {
    const fresh = createBackend();
    seedSheets(fresh, [{ name: 'Morgan Demo' }]);
    fresh.google.properties.setProperty('SETUP_MANAGER_NAME', 'Nobody');
    fresh.google.properties.setProperty('SETUP_MANAGER_PIN', randomPin(fresh));
    expect(() => fresh.run('setManagerPin')).toThrow(/not in the Employees tab/);
    expect(fresh.google.properties.getProperty('SETUP_MANAGER_PIN')).toBeNull();
    expect(fresh.google.properties.getProperty('SETUP_MANAGER_NAME')).toBeNull();
  });

  it('setManagerPin adds Active/Role columns to an Employees tab that only has names', () => {
    const fresh = createBackend();
    seedSheets(fresh, [{ name: 'Morgan Demo' }, { name: 'Alex Demo' }], { employeeColumns: false });
    const pin = randomPin(fresh);
    setupManager(fresh, 'Morgan Demo', pin);
    const header = fresh.google.spreadsheet.getSheetByName('Employees')!.dump()[0];
    expect(header).toEqual(['Employee Name', 'Role', 'Active']);
    expect(fresh.post({ action: 'login', name: 'Morgan Demo', pin }).status).toBe('success');
  });
});
