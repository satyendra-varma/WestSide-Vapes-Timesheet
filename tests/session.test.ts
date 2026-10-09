import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadSession, purgeLegacyStorage, saveSession, Session } from '../src/auth/session';
import { clearCache, readCache, writeCache } from '../src/data/store';
import { parseTimeToMinutes } from '../src/utils/hours';
import { createBackend } from '../mock-backend/loadBackend';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
  keys(): string[] { return [...this.map.keys()]; }
}

const g = globalThis as unknown as { sessionStorage?: MemoryStorage; localStorage?: MemoryStorage };
let sessionStore: MemoryStorage;
let localStore: MemoryStorage;

beforeEach(() => {
  sessionStore = new MemoryStorage();
  localStore = new MemoryStorage();
  g.sessionStorage = sessionStore;
  g.localStorage = localStore;
});

afterEach(() => {
  delete g.sessionStorage;
  delete g.localStorage;
});

const session = (expiresAt: number): Session => ({ token: 'a.b', expiresAt, user: { name: 'Alex Demo', role: 'staff' } });

describe('session storage', () => {
  it('round-trips a live session through sessionStorage only', () => {
    saveSession(session(Date.now() + 60_000));
    expect(loadSession()?.user.name).toBe('Alex Demo');
    expect(localStore.keys()).toEqual([]);
  });

  it('drops expired or malformed sessions', () => {
    saveSession(session(Date.now() - 1));
    expect(loadSession()).toBeNull();
    expect(sessionStore.keys()).toEqual([]);
    sessionStore.setItem('wsv_session', '{"token":1}');
    expect(loadSession()).toBeNull();
  });

  it('clearSession removes the token', () => {
    saveSession(session(Date.now() + 60_000));
    clearSession();
    expect(sessionStore.keys()).toEqual([]);
  });

  it('purges the data caches older builds left in localStorage', () => {
    for (const k of ['westside_vapes_timesheets_data', 'westside_vapes_employees_data', 'westside_vapes_timetable_data', 'westside_vapes_script_url']) localStore.setItem(k, '[]');
    localStore.setItem('wsv_api_url_override', 'https://x');
    purgeLegacyStorage();
    expect(localStore.keys()).toEqual(['wsv_api_url_override']);
  });
});

describe('in-memory data cache', () => {
  it('clearCache forgets everything (used on logout and expiry)', () => {
    writeCache('employees', ['Alex Demo']);
    writeCache('timesheet:10-2026', []);
    clearCache();
    expect(readCache('employees')).toBeUndefined();
    expect(readCache('timesheet:10-2026')).toBeUndefined();
  });
});

describe('frontend and backend agree on time parsing', () => {
  it('normalizeTime (backend) and parseTimeToMinutes (frontend) match on HH:mm input', () => {
    const backend = createBackend();
    const inputs = ['00:00', '09:00', '9:05', '12:30', '23:59', '24:00', '12:60', '', 'abc', '7', '07:5'];
    for (const input of inputs) {
      const normalized = backend.run<string>('normalizeTime', input);
      const minutes = parseTimeToMinutes(input);
      if (minutes === null) {
        expect(normalized, input).toBe('');
      } else {
        expect(normalized, input).toBe(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
      }
    }
  });
});
