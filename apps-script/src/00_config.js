/**
 * WestSide Vapes backend (Google Apps Script, V8 runtime).
 *
 * All files in apps-script/src share one global scope, exactly as Apps Script loads them, and are
 * concatenated in filename order into apps-script/Code.gs (npm run build:gas). Top-level values use
 * `var` and functions use declarations so the Node test harness can reach them.
 *
 * No secrets live in this code. The token signing secret, the PIN pepper and every PIN hash are kept
 * in Script Properties (Project Settings > Script properties) and are generated at runtime.
 *
 * Sheet layout and the request/response contract: docs/PROJECT.md.
 */

var API_VERSION = 2;

var SHEETS = {
  TEMPLATE: 'Template',
  EMPLOYEES: 'Employees',
  TIMETABLE: 'Timetable',
  AUDIT: 'Audit'
};

// Month tabs ("MM-YYYY"): rows 1-2 are headers, row 3 holds day 1. Each shift uses three adjacent
// columns starting at `name`: name, in, out (Morning B-D, Evening F-H).
var MONTH_LAYOUT = {
  FIRST_DAY_ROW: 3,
  SHIFTS: {
    Morning: { name: 2 },
    Evening: { name: 6 }
  }
};

var SHIFT_TYPES = ['Morning', 'Evening'];
var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

var ROLES = { MANAGER: 'manager', STAFF: 'staff' };

var AUTH = {
  TOKEN_TTL_MINUTES: { staff: 8 * 60, manager: 2 * 60 },
  MAX_FAILED_PINS: 5,
  LOCKOUT_MINUTES: 15
};

var PROP_KEYS = {
  TOKEN_SECRET: 'TOKEN_SECRET',
  PIN_PEPPER: 'PIN_PEPPER',
  USER_PREFIX: 'auth.user.',
  SETUP_MANAGER_NAME: 'SETUP_MANAGER_NAME',
  SETUP_MANAGER_PIN: 'SETUP_MANAGER_PIN'
};

var LIMITS = {
  NAME_MAX: 60
};
