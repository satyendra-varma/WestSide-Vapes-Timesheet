import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, seedWorld, SeededWorld } from '../../mock-backend/seed';
import { SHOP_INFO } from '../../src/config';

// Fake clock: Friday 2026-10-09 13:00 America/Vancouver. Yesterday was Thursday.
let backend: Backend;
let world: SeededWorld;

const call = (token: string, action: string, params: Record<string, unknown> = {}) => backend.post({ action, token, ...params });
const setEmail = (name: string, email: string) => {
  const sheet = backend.google.spreadsheet.getSheetByName('Employees')!;
  const row = sheet.dump().findIndex((r) => r[0] === name) + 1;
  sheet.getRange(row, 4).setValue(email);
};
const run = () => backend.run<{ sent: number; note: string }>('sendShiftReminders');
const logShift = (date: string, shift: string, name: string) =>
  call(world.managerToken, 'saveShift', { date, shift, name, inTime: shift === 'Morning' ? '09:00' : '16:00', outTime: shift === 'Morning' ? '16:00' : '23:00' });

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
  setEmail('Alex Demo', 'alex@example.com');
  setEmail('Sam Demo', 'sam@example.com');
  call(world.managerToken, 'updateTimetable', {
    timetable: [
      { dayName: 'Thursday', morning: 'Alex Demo', evening: 'Sam Demo' },
      { dayName: 'Friday', morning: 'Alex Demo', evening: 'Sam Demo' },
    ],
  });
  call(world.managerToken, 'setReminderSettings', { enabled: true, graceMinutes: 60 });
});

describe('sendShiftReminders', () => {
  it('emails the rostered employee once the shift + grace has passed and nothing is logged', () => {
    expect(run()).toEqual({ sent: 2, note: '' });
    const mail = backend.google.mail;
    expect(mail.map((m) => [m.to, m.subject])).toEqual([
      ['alex@example.com', 'Reminder: log your Morning shift (2026-10-08)'],
      ['sam@example.com', 'Reminder: log your Evening shift (2026-10-08)'],
    ]);
    expect(mail[0].body).toContain('Hi Alex Demo');
    expect(mail[0].body).toContain('Thursday 2026-10-08 (ended 16:00)');
    expect(mail[0].body).not.toContain('Sam Demo');
  });

  it('never emails twice for the same shift', () => {
    run();
    expect(run().sent).toBe(0);
    expect(backend.google.mail).toHaveLength(2);
    expect(backend.google.spreadsheet.getSheetByName('Reminders')!.getLastRow()).toBe(3);
  });

  it("doesn't email when the slot was logged, by anyone", () => {
    logShift('2026-10-08', 'Morning', 'Alex Demo');
    logShift('2026-10-08', 'Evening', 'Alex Demo'); // a swap: someone else covered Sam's shift
    expect(run().sent).toBe(0);
  });

  it('waits for the end time plus the grace period, including shifts that end at midnight', () => {
    run(); // Thursday's shifts
    backend.google.clock.advanceMinutes(4 * 60 - 1); // Fri 16:59: morning ended, grace not over
    expect(run().sent).toBe(0);
    backend.google.clock.advanceMinutes(2); // Fri 17:01
    expect(run().sent).toBe(1);
    backend.google.clock.advanceMinutes(6 * 60 + 58); // Fri 23:59: evening grace runs to Sat 00:00
    expect(run().sent).toBe(0);
    backend.google.clock.advanceMinutes(2); // Sat 00:01 (Friday is now "yesterday")
    expect(run().sent).toBe(1);
    expect(backend.google.mail.map((m) => m.subject).slice(-2)).toEqual([
      'Reminder: log your Morning shift (2026-10-09)',
      'Reminder: log your Evening shift (2026-10-09)',
    ]);
  });

  it('skips inactive employees and employees without a valid email', () => {
    call(world.managerToken, 'setEmployeeActive', { name: 'Sam Demo', active: false });
    setEmail('Alex Demo', 'not-an-email');
    expect(run().sent).toBe(0);
  });

  it('does nothing while disabled (the default) and lists rostered staff missing an email', () => {
    call(world.managerToken, 'setReminderSettings', { enabled: false, graceMinutes: 60 });
    expect(run()).toEqual({ sent: 0, note: 'disabled' });
    setEmail('Sam Demo', '');
    const settings = call(world.managerToken, 'getReminderSettings').data as { enabled: boolean; missingEmail: string[]; triggerInstalled: boolean };
    expect(settings).toMatchObject({ enabled: false, missingEmail: ['Sam Demo'], triggerInstalled: false });
    backend.run('installTriggers');
    expect((call(world.managerToken, 'getReminderSettings').data as { triggerInstalled: boolean }).triggerInstalled).toBe(true);
    expect(backend.google.triggers.map((t) => [t.handler, t.kind, t.every])).toEqual([
      ['purgeFulfilledRequests', 'days', 1],
      ['sendShiftReminders', 'hours', 1],
    ]);
  });

  it('is off on a fresh install', () => {
    const fresh = createBackend();
    seedWorld(fresh);
    expect(fresh.run<{ note: string }>('sendShiftReminders').note).toBe('disabled');
  });

  it('stops when the daily email quota is used up', () => {
    const mailApp = backend.google.globals.MailApp as { getRemainingDailyQuota: () => number };
    mailApp.getRemainingDailyQuota = () => 0;
    expect(run()).toEqual({ sent: 0, note: 'daily email quota used up' });
  });
});

describe('reminder settings', () => {
  it('are manager-only and validated', () => {
    const alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    expect(call(alex, 'getReminderSettings').code).toBe('forbidden');
    expect(call(alex, 'setReminderSettings', { enabled: true, graceMinutes: 60 }).code).toBe('forbidden');
    for (const bad of [{ enabled: 'yes', graceMinutes: 60 }, { enabled: true, graceMinutes: 5 }, { enabled: true, graceMinutes: 721 }, { enabled: true, graceMinutes: '60' }]) {
      expect(call(world.managerToken, 'setReminderSettings', bad).code, JSON.stringify(bad)).toBe('invalid');
    }
  });
});

describe('date helpers', () => {
  it('addMinutesLocal crosses midnight, month and year ends', () => {
    expect(backend.run('addMinutesLocal', '2026-10-09', '23:00', 60)).toBe('2026-10-10 00:00');
    expect(backend.run('addMinutesLocal', '2026-10-31', '23:30', 45)).toBe('2026-11-01 00:15');
    expect(backend.run('addMinutesLocal', '2026-12-31', '23:00', 120)).toBe('2027-01-01 01:00');
    expect(backend.run('addMinutesLocal', '2026-03-01', '00:00', -1440)).toBe('2026-02-28 00:00');
  });

  it('dayNameOf', () => {
    expect(backend.run('dayNameOf', '2026-10-09')).toBe('Friday');
    expect(backend.run('dayNameOf', '2028-02-29')).toBe('Tuesday');
  });

  it('shift end times used for reminders match the app defaults (no drift)', () => {
    expect(backend.global('SHIFT_END_TIMES')).toEqual({
      Morning: SHOP_INFO.morningShift.defaultOut,
      Evening: SHOP_INFO.eveningShift.defaultOut,
    });
  });
});
