// The session token lives in sessionStorage only: it survives a reload of the tab but not closing it,
// and it is removed on logout and expiry. No other data is stored with it.
import { LoginResult, SessionUser } from '../api/types';

const SESSION_KEY = 'wsv_session';

export interface Session {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

export function sessionFromLogin(result: LoginResult): Session {
  return { token: result.token, expiresAt: result.expiresAt, user: result.user };
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const user = v.user as Record<string, unknown> | undefined;
  return typeof v.token === 'string' && typeof v.expiresAt === 'number' && !!user &&
    typeof user.name === 'string' && (user.role === 'manager' || user.role === 'staff');
}

export function loadSession(now = Date.now()): Session | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isSession(parsed) && parsed.expiresAt > now) return parsed;
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable or corrupt: treat as logged out.
  }
  return null;
}

export function saveSession(session: Session): void {
  try {
    globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Not persisted; the session still works until the tab reloads.
  }
}

export function clearSession(): void {
  try {
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Legacy v1 caches (employee names, timesheets, roster) that older builds kept in localStorage. */
export function purgeLegacyStorage(): void {
  try {
    for (const key of ['westside_vapes_timesheets_data', 'westside_vapes_timetable_data', 'westside_vapes_employees_data', 'westside_vapes_script_url']) {
      globalThis.localStorage?.removeItem(key);
    }
  } catch {
    // ignore
  }
}
