export const SHOP_INFO = {
  name: "WestSide Vapes",
  tagline: "Kerrisdale Location Timesheet",
  morningShift: {
    label: "Morning Shift",
    defaultIn: "09:00",
    defaultOut: "16:00",
  },
  eveningShift: {
    label: "Evening Shift",
    defaultIn: "16:00",
    defaultOut: "23:00",
  },
};

/** The backend contract this app speaks (apps-script/src/00_config.js API_VERSION). */
export const API_VERSION = 2;

/**
 * URL of the authenticated (v2) Apps Script deployment. Deliberately empty on `dev`: the owner sets it
 * to the NEW deployment's URL when merging to main (docs/MORNING_CHECKLIST.md). Never put the old
 * deployment's URL here, since the old script doesn't understand v2 requests. For local development,
 * set VITE_APPS_SCRIPT_URL instead (e.g. the mock backend: http://localhost:8787/exec).
 */
export const APPS_SCRIPT_URL = '';

const API_URL_OVERRIDE_KEY = 'wsv_api_url_override';

export function getDefaultApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined) ?? '';
  return (fromEnv || APPS_SCRIPT_URL).trim();
}

/** A manager can point this device at another backend (e.g. a staging copy) from Settings. */
export function getApiUrlOverride(): string {
  try {
    return (globalThis.localStorage?.getItem(API_URL_OVERRIDE_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function setApiUrlOverride(url: string | null): void {
  try {
    if (url && url.trim()) globalThis.localStorage?.setItem(API_URL_OVERRIDE_KEY, url.trim());
    else globalThis.localStorage?.removeItem(API_URL_OVERRIDE_KEY);
  } catch {
    // Storage blocked: the override simply doesn't persist.
  }
}

export function getApiUrl(): string {
  return getApiUrlOverride() || getDefaultApiUrl();
}

// Get current date string in YYYY-MM-DD (device local time)
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
