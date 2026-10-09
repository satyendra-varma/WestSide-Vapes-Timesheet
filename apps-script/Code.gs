/**
 * WestSide Vapes backend for Google Apps Script.
 * GENERATED FILE - do not edit. Source: apps-script/src/*.js, regenerate with `npm run build:gas`.
 * Paste this whole file into the Apps Script editor (Code.gs). Deploy steps: docs/MORNING_CHECKLIST.md.
 */

// ---- 00_config.js ----
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

// ---- 01_util.js ----
// Pure helpers: no Apps Script services in this file.

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Display form of a person's name: trimmed, single spaces. */
function cleanName(value) {
  return String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ');
}

/** Lookup key for a name: cleanName, lower case. */
function normalizeName(value) {
  return cleanName(value).toLowerCase();
}

/**
 * "9:00", "09:00:00", "4:00 PM" -> "09:00" / "16:00". Anything else (including empty) -> "".
 * Mirrors parseTimeToMinutes in src/utils/hours.ts (tests/parity.test.ts keeps them in step).
 */
function normalizeTime(value) {
  var str = String(value === null || value === undefined ? '' : value).trim();
  var m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(str);
  if (!m) return '';
  var h = Number(m[1]);
  var meridiem = m[3] ? m[3].toUpperCase() : '';
  if (meridiem && (h < 1 || h > 12)) return '';
  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) return '';
  return pad2(h) + ':' + m[2];
}

function isValidMonthYear(value) {
  return /^(0[1-9]|1[0-2])-\d{4}$/.test(String(value));
}

function daysInMonthOf(year, month) {
  return new Date(year, month, 0).getDate();
}

/** "YYYY-MM-DD" -> { year, month, day, monthYear: "MM-YYYY" } for a real calendar date, else null. */
function parseDateStr(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) return null;
  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonthOf(year, month)) return null;
  return { year: year, month: month, day: day, monthYear: m[2] + '-' + m[1] };
}

/**
 * Text that will be written to a cell. Sheets treats a leading = + - @ as a formula; a leading
 * apostrophe forces plain text and is not shown or returned by getValue().
 */
function safeCellText(value) {
  var str = String(value === null || value === undefined ? '' : value);
  return /^[=+\-@]/.test(str) ? "'" + str : str;
}

/** Compares two strings without stopping at the first difference (signatures are fixed-length hex). */
function constantTimeEquals(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Apps Script returns signed bytes (-128..127); hex-encode them. */
function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function isSixDigitPin(pin) {
  return /^\d{6}$/.test(String(pin));
}

/** Rejects PINs that are trivial to guess: one repeated digit or a straight run (123456, 654321). */
function isWeakPin(pin) {
  var s = String(pin);
  if (/^(\d)\1+$/.test(s)) return true;
  var up = true;
  var down = true;
  for (var i = 1; i < s.length; i++) {
    var d = Number(s[i]) - Number(s[i - 1]);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

/** Blank or anything except an explicit "no" counts as active, so existing rows stay usable. */
function parseActive(value) {
  if (value === false) return false;
  return !/^(false|no|n|0|inactive)$/i.test(String(value === null || value === undefined ? '' : value).trim());
}

/** An error the router turns into {status:"error", code, message, ...extra}. */
function ApiFail(code, message, extra) {
  this.code = code;
  this.message = message;
  this.extra = extra || null;
}

function fail(code, message, extra) {
  return new ApiFail(code, message, extra);
}

// ---- 02_services.js ----
// Thin wrappers around Apps Script services, kept in one place.

function spreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheetTimeZone() {
  return spreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
}

/** Today's date in the spreadsheet's time zone, "YYYY-MM-DD". */
function todayStr() {
  return Utilities.formatDate(new Date(), sheetTimeZone(), 'yyyy-MM-dd');
}

function scriptProps() {
  return PropertiesService.getScriptProperties();
}

function hmacHex(message, key) {
  return bytesToHex(Utilities.computeHmacSha256Signature(String(message), String(key)));
}

/** 64 hex characters from two random UUIDs (about 244 random bits). */
function randomSecret() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** Reads a secret, creating it on first use. Only call this while holding the script lock. */
function getOrCreateSecret(key) {
  var props = scriptProps();
  var value = props.getProperty(key);
  if (!value) {
    value = randomSecret();
    props.setProperty(key, value);
  }
  return value;
}

/** Per-employee auth state: { salt, hash, failed, lockedUntil (ms), tv (token version) }. */
function getAuthRecord(nameKey) {
  var raw = scriptProps().getProperty(PROP_KEYS.USER_PREFIX + nameKey);
  var rec = null;
  try {
    rec = raw ? JSON.parse(raw) : null;
  } catch (e) {
    rec = null;
  }
  rec = rec || {};
  return {
    salt: rec.salt || '',
    hash: rec.hash || '',
    failed: Number(rec.failed) || 0,
    lockedUntil: Number(rec.lockedUntil) || 0,
    tv: Number(rec.tv) || 0
  };
}

function saveAuthRecord(nameKey, rec) {
  scriptProps().setProperty(PROP_KEYS.USER_PREFIX + nameKey, JSON.stringify(rec));
}

function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw fail('busy', 'Server busy, please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---- 03_audit.js ----
// Audit tab: Timestamp | Actor | Action | Target | Details.
// Never write PINs, tokens, or customer names/phone numbers here.

var AUDIT_HEADER = ['Timestamp', 'Actor', 'Action', 'Target', 'Details'];

function auditSheet() {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.AUDIT);
    sheet.appendRow(AUDIT_HEADER);
  }
  return sheet;
}

function audit(actor, action, target, details) {
  auditSheet().appendRow([
    Utilities.formatDate(new Date(), sheetTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    safeCellText(String(actor || '').slice(0, LIMITS.NAME_MAX)),
    action,
    safeCellText(String(target || '').slice(0, 80)),
    safeCellText(String(details || '').slice(0, 300))
  ]);
}

function auditCellText(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, sheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value === null || value === undefined ? '' : value);
}

/** Manager only. req: { limit? (1-200, default 50), offset? (rows to skip from the newest) }. Newest first. */
function actionGetAudit(req) {
  var limit = Math.min(Math.max(Math.floor(Number(req.limit) || 50), 1), 200);
  var offset = Math.max(Math.floor(Number(req.offset) || 0), 0);
  var sheet = spreadsheet().getSheetByName(SHEETS.AUDIT);
  var total = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
  if (!sheet || total === 0 || offset >= total) return { entries: [], total: total };
  var lastRow = sheet.getLastRow() - offset; // newest row still wanted
  var firstRow = Math.max(2, lastRow - limit + 1);
  var values = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, AUDIT_HEADER.length).getValues();
  var entries = values.map(function (r) {
    return { timestamp: auditCellText(r[0]), actor: auditCellText(r[1]), action: auditCellText(r[2]), target: auditCellText(r[3]), details: auditCellText(r[4]) };
  }).reverse();
  return { entries: entries, total: total };
}

// ---- 04_employees.js ----
// Employees tab: column A = name (row 1 is a header). Optional columns are found by their row-1
// header, case-insensitively: "Active", "Role", "Email". Missing columns mean: active, staff, no email.
// ensureEmployeeColumns() only ever appends missing headers after the last used column.

var EMPLOYEE_OPTIONAL_COLUMNS = ['Active', 'Role'];

function employeesSheet() {
  return spreadsheet().getSheetByName(SHEETS.EMPLOYEES);
}

function employeeHeaderIndex(headerRow) {
  var lower = headerRow.map(function (h) { return String(h).trim().toLowerCase(); });
  return {
    active: lower.indexOf('active'),
    role: lower.indexOf('role'),
    email: lower.indexOf('email')
  };
}

/** All employees, in sheet order: { name, key, row, active, role, email }. */
function readEmployees() {
  var sheet = employeesSheet();
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var idx = employeeHeaderIndex(values[0]);
  var seen = {};
  var list = [];
  for (var r = 1; r < values.length; r++) {
    var name = cleanName(values[r][0]);
    if (!name) continue;
    var key = normalizeName(name);
    if (seen[key]) continue; // duplicate names: the first row wins
    seen[key] = true;
    var roleCell = idx.role >= 0 ? String(values[r][idx.role]).trim().toLowerCase() : '';
    list.push({
      name: name,
      key: key,
      row: r + 1,
      active: idx.active >= 0 ? parseActive(values[r][idx.active]) : true,
      role: roleCell === ROLES.MANAGER ? ROLES.MANAGER : ROLES.STAFF,
      email: idx.email >= 0 ? String(values[r][idx.email]).trim() : ''
    });
  }
  return list;
}

function findEmployee(name) {
  var key = normalizeName(name);
  if (!key) return null;
  var list = readEmployees();
  for (var i = 0; i < list.length; i++) {
    if (list[i].key === key) return list[i];
  }
  return null;
}

/** Appends any missing optional headers. Returns 1-based column numbers by lower-case header. */
function ensureEmployeeColumns(headers) {
  var sheet = employeesSheet();
  if (!sheet) throw fail('not_found', 'The Employees tab is missing.');
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var cols = {};
  (headers || EMPLOYEE_OPTIONAL_COLUMNS).forEach(function (title) {
    var i = header.indexOf(title.toLowerCase());
    if (i === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(title);
      header[lastCol - 1] = title.toLowerCase();
      i = lastCol - 1;
    }
    cols[title.toLowerCase()] = i + 1;
  });
  return cols;
}

function setEmployeeCell(employee, title, value) {
  var cols = ensureEmployeeColumns([title]);
  employeesSheet().getRange(employee.row, cols[title.toLowerCase()]).setValue(value);
}

// ---- 05_auth.js ----
// PIN login and signed session tokens (DECISIONS D-018).
//
// PIN hash  = HMAC-SHA256(key = PIN_PEPPER, message = salt + ":" + pin), salt random per employee.
// Token     = payload + "." + HMAC-SHA256(key = TOKEN_SECRET, message = payload)
//   payload = encodeURIComponent(JSON {n: name, r: role, v: token version, iat, exp}) (seconds)
// Every request re-reads the employee (active flag, current role) and the token version, so a
// deactivation or PIN reset takes effect on the next request.

function hashPin(pin, salt, pepper) {
  return hmacHex(salt + ':' + pin, pepper);
}

/** Sets a new PIN: new salt, clears any lockout, and bumps the token version (old sessions die). */
function setEmployeePin(employee, pin) {
  var rec = getAuthRecord(employee.key);
  rec.salt = randomSecret().slice(0, 32);
  rec.hash = hashPin(pin, rec.salt, getOrCreateSecret(PROP_KEYS.PIN_PEPPER));
  rec.failed = 0;
  rec.lockedUntil = 0;
  rec.tv = rec.tv + 1;
  saveAuthRecord(employee.key, rec);
}

function validateNewPin(pin) {
  if (!isSixDigitPin(pin)) throw fail('invalid', 'PIN must be exactly 6 digits.', { field: 'pin' });
  if (isWeakPin(pin)) throw fail('invalid', 'That PIN is too easy to guess. Avoid repeated digits and runs like 123456.', { field: 'pin' });
}

function issueToken(employee, rec) {
  var nowSec = Math.floor(Date.now() / 1000);
  var ttlMin = AUTH.TOKEN_TTL_MINUTES[employee.role] || AUTH.TOKEN_TTL_MINUTES.staff;
  var payload = { n: employee.name, r: employee.role, v: rec.tv, iat: nowSec, exp: nowSec + ttlMin * 60 };
  var body = encodeURIComponent(JSON.stringify(payload));
  return {
    token: body + '.' + hmacHex(body, getOrCreateSecret(PROP_KEYS.TOKEN_SECRET)),
    expiresAt: payload.exp * 1000
  };
}

/** Checks signature and expiry only. Returns the payload or throws 'unauthorized'. */
function verifyToken(token) {
  var denied = fail('unauthorized', 'Please log in again.');
  if (typeof token !== 'string' || token.length > 2000) throw denied;
  var parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw denied;
  var secret = scriptProps().getProperty(PROP_KEYS.TOKEN_SECRET);
  if (!secret) throw denied;
  if (!constantTimeEquals(hmacHex(parts[0], secret), parts[1])) throw denied;
  var payload;
  try {
    payload = JSON.parse(decodeURIComponent(parts[0]));
  } catch (e) {
    throw denied;
  }
  if (!payload || typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) >= payload.exp) throw denied;
  return payload;
}

/** Full per-request check. Returns the session { name, role } using the employee's current role. */
function authenticate(token) {
  var payload = verifyToken(token);
  var employee = findEmployee(payload.n);
  var denied = fail('unauthorized', 'Please log in again.');
  if (!employee || !employee.active) throw denied;
  var rec = getAuthRecord(employee.key);
  if (!rec.hash || rec.tv !== payload.v) throw denied;
  return { name: employee.name, key: employee.key, role: employee.role };
}

function actionLogin(req) {
  var typedName = cleanName(req.name).slice(0, LIMITS.NAME_MAX);
  var pin = String(req.pin === null || req.pin === undefined ? '' : req.pin);
  var badCredentials = fail('invalid_credentials', 'Name or PIN is incorrect.');
  var pepper = getOrCreateSecret(PROP_KEYS.PIN_PEPPER);
  var employee = typedName ? findEmployee(typedName) : null;
  var rec = employee ? getAuthRecord(employee.key) : null;

  if (!employee || !employee.active || !rec.hash || !isSixDigitPin(pin)) {
    hashPin(pin, 'no-such-user', pepper); // keep timing similar to a real check
    audit(employee ? employee.name : '(unknown)', 'login.failed', typedName, employee && employee.active && !rec.hash ? 'no PIN set' : 'unknown, inactive or malformed');
    throw badCredentials;
  }

  var now = Date.now();
  if (rec.lockedUntil > now) {
    audit(employee.name, 'login.blocked', employee.name, 'locked');
    throw fail('locked', 'Too many wrong PINs. Try again later or ask the manager to unlock.', {
      retryAfterMinutes: Math.ceil((rec.lockedUntil - now) / 60000)
    });
  }

  if (!constantTimeEquals(hashPin(pin, rec.salt, pepper), rec.hash)) {
    rec.failed += 1;
    if (rec.failed >= AUTH.MAX_FAILED_PINS) {
      rec.failed = 0;
      rec.lockedUntil = now + AUTH.LOCKOUT_MINUTES * 60000;
      saveAuthRecord(employee.key, rec);
      audit(employee.name, 'login.locked', employee.name, AUTH.MAX_FAILED_PINS + ' wrong PINs, locked ' + AUTH.LOCKOUT_MINUTES + ' min');
      throw fail('locked', 'Too many wrong PINs. Try again later or ask the manager to unlock.', {
        retryAfterMinutes: AUTH.LOCKOUT_MINUTES
      });
    }
    saveAuthRecord(employee.key, rec);
    audit(employee.name, 'login.failed', employee.name, 'wrong PIN (' + rec.failed + '/' + AUTH.MAX_FAILED_PINS + ')');
    throw badCredentials;
  }

  rec.failed = 0;
  rec.lockedUntil = 0;
  saveAuthRecord(employee.key, rec);
  var issued = issueToken(employee, rec);
  audit(employee.name, 'login.success', employee.name, employee.role);
  return { token: issued.token, expiresAt: issued.expiresAt, user: { name: employee.name, role: employee.role } };
}

// ---- 06_timesheet.js ----
// Month tabs "MM-YYYY", copied from "Template" on the first write of a month (which also adds the
// minute columns and totals, see 09_month_formulas.js).
// Row = day + 2. Morning: B name, C in, D out. Evening: F name, G in, H out. In/Out are written as
// plain text "HH:mm"; older rows may hold time values, which readTimeCell() also understands.

function getMonthSheet(monthYear, createIfMissing) {
  if (!isValidMonthYear(monthYear)) throw fail('invalid', 'Invalid month.', { field: 'monthYear' });
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(monthYear);
  if (!sheet && createIfMissing) {
    var template = ss.getSheetByName(SHEETS.TEMPLATE);
    if (!template) throw fail('server_error', "The 'Template' tab is missing.");
    sheet = template.copyTo(ss);
    sheet.setName(monthYear);
    sheet.protect().setDescription('Protected Monthly Sheet (' + monthYear + ')').setWarningOnly(true);
    ensureMonthFormulas(sheet);
  }
  return sheet;
}

/** A time cell as "HH:mm": handles text, Date values and day-fraction numbers. */
function readTimeCell(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, sheetTimeZone(), 'HH:mm');
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    var minutes = Math.round(value * 1440) % 1440;
    return pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60);
  }
  return normalizeTime(value) || String(value).trim();
}

function shiftColumns(shift) {
  var layout = MONTH_LAYOUT.SHIFTS[shift];
  if (!layout) throw fail('invalid', 'Shift must be Morning or Evening.', { field: 'shift' });
  return layout;
}

function readSlot(sheet, day, shift) {
  var cols = shiftColumns(shift);
  var values = sheet.getRange(MONTH_LAYOUT.FIRST_DAY_ROW + day - 1, cols.name, 1, 3).getValues()[0];
  return { name: cleanName(values[0]), inTime: readTimeCell(values[1]), outTime: readTimeCell(values[2]) };
}

function actionGetTimesheet(req) {
  var monthYear = String(req.monthYear || '');
  var sheet = getMonthSheet(monthYear, false);
  if (!sheet) return { monthYear: monthYear, records: [] };
  var parts = monthYear.split('-');
  var year = Number(parts[1]);
  var month = Number(parts[0]);
  var days = daysInMonthOf(year, month);
  var lastCol = Math.max(sheet.getLastColumn(), 8);
  var values = sheet.getRange(MONTH_LAYOUT.FIRST_DAY_ROW, 1, days, lastCol).getValues();
  var records = [];
  for (var d = 1; d <= days; d++) {
    var row = values[d - 1];
    var date = parts[1] + '-' + parts[0] + '-' + pad2(d);
    SHIFT_TYPES.forEach(function (shift) {
      var c = MONTH_LAYOUT.SHIFTS[shift].name - 1;
      var name = cleanName(row[c]);
      if (!name) return;
      records.push({ date: date, shift: shift, name: name, inTime: readTimeCell(row[c + 1]), outTime: readTimeCell(row[c + 2]) });
    });
  }
  return { monthYear: monthYear, records: records };
}

/**
 * Optimistic concurrency for edits and deletes: the client sends the slot as it saw it. If the sheet
 * has changed since then (another device), the server answers "conflict" instead of overwriting.
 */
function slotMatches(slot, expected) {
  if (!expected || typeof expected !== 'object') return true;
  return normalizeName(slot.name) === normalizeName(expected.name) &&
    String(slot.inTime) === String(expected.inTime || '') &&
    String(slot.outTime) === String(expected.outTime || '');
}

function describeSlot(slot) {
  return slot.name ? slot.name + ' ' + (slot.inTime || '--:--') + '-' + (slot.outTime || '--:--') : 'empty';
}

/**
 * req: { date: "YYYY-MM-DD", shift, name, inTime, outTime, forceOverwrite, expectedPrevious? }
 * Staff can only log their own shifts and can't replace someone else's. Managers can do both.
 * expectedPrevious (sent by edits) must still match the sheet, otherwise the answer is a conflict.
 */
function actionSaveShift(req, session) {
  var date = parseDateStr(req.date);
  if (!date) throw fail('invalid', 'Invalid date.', { field: 'date' });
  if (String(req.date) > todayStr()) throw fail('invalid', "Future dates can't be logged.", { field: 'date' });
  shiftColumns(req.shift);

  var employee = findEmployee(req.name);
  if (!employee || !employee.active) throw fail('invalid', 'Unknown or inactive employee.', { field: 'name' });
  var isManager = session.role === ROLES.MANAGER;
  if (!isManager && employee.key !== session.key) throw fail('forbidden', 'You can only log your own shifts.');

  var inTime = normalizeTime(req.inTime);
  var outTime = normalizeTime(req.outTime);
  if (!inTime) throw fail('invalid', 'In time must be HH:mm.', { field: 'inTime' });
  if (!outTime) throw fail('invalid', 'Out time must be HH:mm.', { field: 'outTime' });
  if (inTime === outTime) throw fail('invalid', 'Shift length is 0. Check the in and out times.', { field: 'outTime' });

  var sheet = getMonthSheet(date.monthYear, true);
  var previous = readSlot(sheet, date.day, req.shift);
  var occupied = !!(previous.name || previous.inTime || previous.outTime);
  var unchanged = normalizeName(previous.name) === employee.key && previous.inTime === inTime && previous.outTime === outTime;

  if (!unchanged && req.expectedPrevious && !slotMatches(previous, req.expectedPrevious)) {
    return { conflict: true, previousData: previous };
  }
  if (occupied && !unchanged) {
    if (req.forceOverwrite !== true) {
      return { conflict: true, previousData: previous };
    }
    if (!isManager && normalizeName(previous.name) !== session.key) {
      throw fail('forbidden', "Only a manager can replace another employee's shift.");
    }
  }

  if (!unchanged) {
    var row = MONTH_LAYOUT.FIRST_DAY_ROW + date.day - 1;
    var cols = shiftColumns(req.shift);
    sheet.getRange(row, 1).setValue(pad2(date.month) + '/' + pad2(date.day) + '/' + date.year);
    // Plain text, so the sheet stores exactly "HH:mm" (no time-zone or locale conversion).
    sheet.getRange(row, cols.name + 1, 1, 2).setNumberFormat('@');
    sheet.getRange(row, cols.name, 1, 3).setValues([[safeCellText(employee.name), inTime, outTime]]);
    audit(session.name, occupied ? 'shift.update' : 'shift.create', req.date + ' ' + req.shift,
      employee.name + ' ' + inTime + '-' + outTime + (occupied ? ' (was: ' + describeSlot(previous) + ')' : ''));
  }
  return { previousData: previous };
}

/** req: { date, shift, expected? }. Manager only (enforced by the router). */
function actionDeleteShift(req, session) {
  var date = parseDateStr(req.date);
  if (!date) throw fail('invalid', 'Invalid date.', { field: 'date' });
  var cols = shiftColumns(req.shift);
  var sheet = getMonthSheet(date.monthYear, false);
  if (!sheet) throw fail('not_found', 'No shifts are logged for that month.');
  var previous = readSlot(sheet, date.day, req.shift);
  if (!previous.name && !previous.inTime && !previous.outTime) throw fail('not_found', 'That shift is already empty.');
  if (req.expected && !slotMatches(previous, req.expected)) return { conflict: true, previousData: previous };
  sheet.getRange(MONTH_LAYOUT.FIRST_DAY_ROW + date.day - 1, cols.name, 1, 3).setValues([['', '', '']]);
  audit(session.name, 'shift.delete', req.date + ' ' + req.shift, 'was: ' + describeSlot(previous));
  return { previousData: previous };
}

// ---- 07_timetable.js ----
// Timetable tab: column A = day name (matched case-insensitively), B = Morning, C = Evening.
// Other rows/columns are left alone.

var TIMETABLE_HEADER_WORDS = ['morning', 'morning shift', 'evening', 'evening shift', 'employee', 'name'];

function timetableCell(value) {
  var name = cleanName(value);
  return TIMETABLE_HEADER_WORDS.indexOf(name.toLowerCase()) === -1 ? name : '';
}

function actionGetTimetable() {
  var sheet = spreadsheet().getSheetByName(SHEETS.TIMETABLE);
  var rows = sheet && sheet.getLastRow() > 0 ? sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues() : [];
  return DAY_NAMES.map(function (dayName) {
    var found = null;
    for (var i = 0; i < rows.length; i++) {
      if (cleanName(rows[i][0]).toLowerCase() === dayName.toLowerCase()) {
        found = rows[i];
        break;
      }
    }
    return { dayName: dayName, morning: found ? timetableCell(found[1]) : '', evening: found ? timetableCell(found[2]) : '' };
  });
}

/** req.timetable: [{ dayName, morning, evening }]. Names must be active employees or blank. */
function actionUpdateTimetable(req, session) {
  if (!Array.isArray(req.timetable)) throw fail('invalid', 'Missing timetable.');
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(SHEETS.TIMETABLE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.TIMETABLE);
    sheet.appendRow(['Day', 'Morning', 'Evening']);
  }

  var updates = [];
  req.timetable.forEach(function (day) {
    var dayName = cleanName(day && day.dayName);
    var canonical = DAY_NAMES.filter(function (d) { return d.toLowerCase() === dayName.toLowerCase(); })[0];
    if (!canonical) throw fail('invalid', 'Unknown day: ' + dayName.slice(0, 20), { field: 'dayName' });
    var names = [day.morning, day.evening].map(function (value) {
      var clean = cleanName(value);
      if (!clean) return '';
      var employee = findEmployee(clean);
      if (!employee || !employee.active) throw fail('invalid', 'Unknown or inactive employee on ' + canonical + '.', { field: 'name' });
      return employee.name;
    });
    updates.push({ dayName: canonical, morning: names[0], evening: names[1] });
  });

  var lastRow = sheet.getLastRow();
  var dayColumn = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 1).getValues().map(function (r) { return cleanName(r[0]).toLowerCase(); }) : [];
  var changes = [];
  updates.forEach(function (u) {
    var index = dayColumn.indexOf(u.dayName.toLowerCase());
    if (index === -1) {
      sheet.appendRow([u.dayName, safeCellText(u.morning), safeCellText(u.evening)]);
      dayColumn.push(u.dayName.toLowerCase());
      changes.push(u.dayName + ': ' + (u.morning || '-') + ' / ' + (u.evening || '-'));
      return;
    }
    var current = sheet.getRange(index + 1, 2, 1, 2).getValues()[0].map(cleanName);
    if (current[0] === u.morning && current[1] === u.evening) return;
    sheet.getRange(index + 1, 2, 1, 2).setValues([[safeCellText(u.morning), safeCellText(u.evening)]]);
    changes.push(u.dayName + ': ' + (current[0] || '-') + ' / ' + (current[1] || '-') + ' -> ' + (u.morning || '-') + ' / ' + (u.evening || '-'));
  });
  if (changes.length) audit(session.name, 'timetable.update', 'Timetable', changes.join('; '));
  return actionGetTimetable();
}

// ---- 08_staff.js ----
// Employee list and manager-only staff management (PINs, lockout, active flag).

/** Staff see active names only; the manager also sees role, active, PIN and lock status. */
function actionGetEmployees(req, session) {
  var list = readEmployees();
  if (session.role !== ROLES.MANAGER) {
    return list.filter(function (e) { return e.active; }).map(function (e) { return { name: e.name, role: e.role, active: true }; });
  }
  var now = Date.now();
  return list.map(function (e) {
    var rec = getAuthRecord(e.key);
    return {
      name: e.name,
      role: e.role,
      active: e.active,
      hasPin: !!rec.hash,
      lockedUntil: rec.lockedUntil > now ? rec.lockedUntil : 0
    };
  });
}

function requireEmployee(name) {
  var employee = findEmployee(name);
  if (!employee) throw fail('not_found', 'No employee with that name in the Employees tab.', { field: 'name' });
  return employee;
}

/** req: { name, pin }. Sets or resets a PIN; logs that employee out everywhere. */
function actionSetPin(req, session) {
  var employee = requireEmployee(req.name);
  var pin = String(req.pin === null || req.pin === undefined ? '' : req.pin);
  validateNewPin(pin);
  setEmployeePin(employee, pin);
  audit(session.name, 'pin.set', employee.name, 'PIN set or reset; existing sessions ended');
  return { name: employee.name };
}

function actionUnlockEmployee(req, session) {
  var employee = requireEmployee(req.name);
  var rec = getAuthRecord(employee.key);
  rec.failed = 0;
  rec.lockedUntil = 0;
  saveAuthRecord(employee.key, rec);
  audit(session.name, 'employee.unlock', employee.name, '');
  return { name: employee.name };
}

/** req: { name, active: boolean }. Deactivation ends the employee's sessions immediately. */
function actionSetEmployeeActive(req, session) {
  var employee = requireEmployee(req.name);
  if (typeof req.active !== 'boolean') throw fail('invalid', 'active must be true or false.', { field: 'active' });
  if (!req.active && employee.key === session.key) throw fail('invalid', "You can't deactivate yourself.");
  setEmployeeCell(employee, 'Active', req.active ? 'TRUE' : 'FALSE');
  if (!req.active) {
    var rec = getAuthRecord(employee.key);
    rec.tv += 1;
    saveAuthRecord(employee.key, rec);
  }
  audit(session.name, req.active ? 'employee.activate' : 'employee.deactivate', employee.name, '');
  return { name: employee.name, active: req.active };
}

// ---- 09_month_formulas.js ----
// Additive minute columns and totals on month tabs (and the Template), so the sheet itself sums whole
// minutes exactly like the app (DECISIONS D-001, D-021, D-035). Existing columns A-I are never touched.
//
//   J "Morning Min", K "Evening Min": integer minutes per shift by formula (past-midnight safe,
//     "" when a time is missing, "CHECK" when a time can't be read).
//   M-Q: totals. Row 1 = all staff, row 2 = headers, rows 3-33 = one row per employee in this month
//     (filled by array formulas anchored in row 3). N = 1st-15th, O = 16th-end, P = month (minutes),
//     Q = month as h:mm.
// No rounded decimal hours anywhere. Run migrateSheets() once (owner) for existing tabs; new month
// tabs get the columns when they're created.

var MINUTES_FIRST_COL = 10; // J
var SUMMARY_FIRST_COL = 13; // M
var SUMMARY_LAST_COL = 17; // Q
var MONTH_LAST_ROW = MONTH_LAYOUT.FIRST_DAY_ROW + 30; // row 33 = day 31
var FIRST_HALF_LAST_ROW = MONTH_LAYOUT.FIRST_DAY_ROW + 14; // row 17 = day 15

/** Minutes formula for one row, e.g. minuteFormula('C', 'D', 3). */
function minuteFormula(inCol, outCol, row) {
  var a = inCol + row;
  var b = outCol + row;
  return '=IF(OR(' + a + '="",' + b + '=""),"",IFERROR(MOD(ROUND((TIMEVALUE(TEXT(' + b + ',"HH:mm"))-TIMEVALUE(TEXT(' + a + ',"HH:mm")))*1440),1440),"CHECK"))';
}

/** Everything the migration writes, as rectangular blocks of values or formulas (pure; tested). */
function monthFormulaBlocks() {
  var first = MONTH_LAYOUT.FIRST_DAY_ROW;
  var last = MONTH_LAST_ROW;
  var half = FIRST_HALF_LAST_ROW;
  var minuteRows = [];
  for (var r = first; r <= last; r++) minuteRows.push([minuteFormula('C', 'D', r), minuteFormula('G', 'H', r)]);

  var names = 'M' + first + ':M' + last;
  var sumIf = function (from, to) {
    return 'SUMIF(B' + from + ':B' + to + ',' + names + ',J' + from + ':J' + to + ')+SUMIF(F' + from + ':F' + to + ',' + names + ',K' + from + ':K' + to + ')';
  };
  var both = 'FLATTEN(B' + first + ':B' + last + ',F' + first + ':F' + last + ')';
  var col = function (letter) { return letter + first + ':' + letter + last; };

  return [
    { row: 2, col: MINUTES_FIRST_COL, values: [['Morning Min', 'Evening Min']] },
    { row: first, col: MINUTES_FIRST_COL, formulas: minuteRows },
    { row: 1, col: SUMMARY_FIRST_COL, values: [['All staff']] },
    {
      row: 1,
      col: SUMMARY_FIRST_COL + 1,
      formulas: [[
        '=SUM(J' + first + ':J' + half + ')+SUM(K' + first + ':K' + half + ')',
        '=SUM(J' + (half + 1) + ':J' + last + ')+SUM(K' + (half + 1) + ':K' + last + ')',
        '=N1+O1',
        '=INT(P1/60)&":"&TEXT(MOD(P1,60),"00")'
      ]]
    },
    { row: 2, col: SUMMARY_FIRST_COL, values: [['Employee', '1-15 min', '16-end min', 'Month min', 'Month h:mm']] },
    {
      row: first,
      col: SUMMARY_FIRST_COL,
      formulas: [[
        '=IFERROR(SORT(UNIQUE(FILTER(' + both + ',' + both + '<>""))),"")',
        '=ARRAYFORMULA(IF(' + names + '="","",' + sumIf(first, half) + '))',
        '=ARRAYFORMULA(IF(' + names + '="","",' + sumIf(half + 1, last) + '))',
        '=ARRAYFORMULA(IF(' + names + '="","",' + col('N') + '+' + col('O') + '))',
        '=ARRAYFORMULA(IF(' + names + '="","",INT(' + col('P') + '/60)&":"&TEXT(MOD(' + col('P') + ',60),"00")))'
      ]]
    }
  ];
}

/**
 * Adds the minute columns and totals to one month/Template tab using two reads and a few batch
 * writes. Returns 'added', 'present', or 'skipped: …' when a target cell holds something else (then
 * nothing at all is written).
 */
function ensureMonthFormulas(sheet) {
  var width = SUMMARY_LAST_COL - MINUTES_FIRST_COL + 1;
  var area = sheet.getRange(1, MINUTES_FIRST_COL, MONTH_LAST_ROW, width);
  var values = area.getValues();
  var formulas = area.getFormulas();
  var blocks = monthFormulaBlocks();
  var cellName = function (row, col) { return String.fromCharCode(64 + col) + row; };

  var conflict = null;
  var allPresent = true;
  blocks.forEach(function (block) {
    var data = block.formulas || block.values;
    data.forEach(function (line, i) {
      line.forEach(function (expected, j) {
        var r = block.row + i - 1;
        var c = block.col + j - MINUTES_FIRST_COL;
        var haveFormula = formulas[r][c];
        var haveValue = values[r][c];
        var same = block.formulas ? haveFormula === expected : !haveFormula && String(haveValue) === expected;
        var empty = !haveFormula && (haveValue === '' || haveValue === null);
        if (!same) allPresent = false;
        if (!same && !empty && !conflict) conflict = cellName(block.row + i, block.col + j);
      });
    });
  });
  if (allPresent) return 'present';
  if (conflict) return 'skipped: ' + conflict + ' already holds something else';

  // The totals' array formulas fill M4:Q33; those cells must be empty or the formulas can't expand.
  for (var r = MONTH_LAYOUT.FIRST_DAY_ROW; r < MONTH_LAST_ROW; r++) {
    for (var c = SUMMARY_FIRST_COL - MINUTES_FIRST_COL; c < width; c++) {
      if (formulas[r][c] || (values[r][c] !== '' && values[r][c] !== null)) {
        return 'skipped: ' + cellName(r + 1, c + MINUTES_FIRST_COL) + ' already holds something else';
      }
    }
  }

  blocks.forEach(function (block) {
    var data = block.formulas || block.values;
    var range = sheet.getRange(block.row, block.col, data.length, data[0].length);
    if (block.formulas) range.setFormulas(data);
    else range.setValues(data);
  });
  return 'added';
}

/**
 * Makes the Template's In/Out cells plain text so manual entries also stay exactly "HH:mm". Only when
 * they're all empty: applying "@" to an existing time value would display it as a raw number.
 */
function setTemplateTimeFormats(sheet) {
  var first = MONTH_LAYOUT.FIRST_DAY_ROW;
  var rows = MONTH_LAST_ROW - first + 1;
  var ranges = SHIFT_TYPES.map(function (shift) {
    return sheet.getRange(first, MONTH_LAYOUT.SHIFTS[shift].name + 1, rows, 2);
  });
  var hasValues = ranges.some(function (range) {
    return range.getValues().some(function (line) { return line.some(function (v) { return v !== '' && v !== null; }); });
  });
  if (hasValues) return false;
  ranges.forEach(function (range) { range.setNumberFormat('@'); });
  return true;
}

/**
 * Owner-run, once (Apps Script editor: choose migrateSheets, then Run). Adds the minute columns and
 * totals to the Template and every MM-YYYY tab, and makes the Template's empty In/Out cells plain text.
 * Additive only; re-running is harmless. The execution log lists what happened per tab.
 */
function migrateSheets() {
  return withScriptLock(function () {
    var report = [];
    spreadsheet().getSheets().forEach(function (sheet) {
      var name = sheet.getName();
      if (name !== SHEETS.TEMPLATE && !isValidMonthYear(name)) return;
      var result = ensureMonthFormulas(sheet);
      if (name === SHEETS.TEMPLATE && result.indexOf('skipped') !== 0) {
        result += setTemplateTimeFormats(sheet) ? ', In/Out set to plain text' : ', In/Out format left alone (cells not empty)';
      }
      report.push(name + ': ' + result);
    });
    if (!report.length) report.push('No Template or MM-YYYY tabs found.');
    audit('(setup)', 'setup.migrateSheets', 'month tabs', report.join('; '));
    Logger.log('migrateSheets:\n' + report.join('\n'));
    return report;
  });
}

// ---- 10_records.js ----
// Small helpers for tabs that are simple tables: row 1 = header, one record per row, column A = ID.
// All cells are written as plain text (format "@") so Sheets never reinterprets them, and
// user-entered text goes through safeCellText (formula-injection guard).

/** Returns the tab, creating it with a header row (and plain-text format) if it's missing. */
function tableSheet(name, header) {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}

/** A cell as text: Date values (if someone typed in the sheet) are formatted in the sheet's zone. */
function cellText(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, sheetTimeZone(), 'yyyy-MM-dd HH:mm');
  }
  return String(value === null || value === undefined ? '' : value);
}

/** All data rows as arrays of text, with their 1-based sheet row number. */
function tableRows(sheet, width) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, width).getValues().map(function (r, i) {
    return { row: i + 2, cells: r.map(cellText) };
  }).filter(function (r) { return r.cells[0] !== ''; });
}

function appendTableRow(sheet, cells) {
  var row = sheet.getLastRow() + 1;
  var range = sheet.getRange(row, 1, 1, cells.length);
  range.setNumberFormat('@');
  range.setValues([cells.map(safeCellText)]);
  return row;
}

function writeTableCells(sheet, row, col, cells) {
  var range = sheet.getRange(row, col, 1, cells.length);
  range.setNumberFormat('@');
  range.setValues([cells.map(safeCellText)]);
}

function findTableRow(sheet, width, id) {
  var rows = tableRows(sheet, width);
  for (var i = 0; i < rows.length; i++) if (rows[i].cells[0] === id) return rows[i];
  return null;
}

function newRecordId(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function nowStamp() {
  return Utilities.formatDate(new Date(), sheetTimeZone(), 'yyyy-MM-dd HH:mm');
}

/** Trimmed, single-spaced text with a length limit; throws a generic message naming only the field. */
function requiredText(value, max, field, label) {
  var text = cleanName(value);
  if (!text || text.length > max) {
    throw fail('invalid', 'Enter ' + label + ' (up to ' + max + ' characters).', { field: field });
  }
  return text;
}

// ---- 11_stock.js ----
// Stock tab: low / out-of-stock list. Any logged-in staff member can add items and tick them resolved.
// Columns: ID | Product | Status | Noted By | Noted At | Resolved | Resolved By | Resolved At

var STOCK_HEADER = ['ID', 'Product', 'Status', 'Noted By', 'Noted At', 'Resolved', 'Resolved By', 'Resolved At'];
var STOCK_STATUSES = ['low', 'out'];

function stockSheet() {
  return tableSheet('Stock', STOCK_HEADER);
}

function stockItem(r) {
  var c = r.cells;
  return {
    id: c[0], product: c[1], status: c[2], notedBy: c[3], notedAt: c[4],
    resolved: String(c[5]).toUpperCase() === 'TRUE', resolvedBy: c[6], resolvedAt: c[7]
  };
}

function actionGetStock() {
  var sheet = spreadsheet().getSheetByName('Stock');
  return sheet ? tableRows(sheet, STOCK_HEADER.length).map(stockItem) : [];
}

/** req: { product, status: "low"|"out" }. An open item for the same product is updated instead of duplicated. */
function actionAddStock(req, session) {
  var product = requiredText(req.product, 80, 'product', 'a product name');
  var status = String(req.status || '');
  if (STOCK_STATUSES.indexOf(status) === -1) throw fail('invalid', 'Status must be low or out.', { field: 'status' });

  var sheet = stockSheet();
  var rows = tableRows(sheet, STOCK_HEADER.length);
  for (var i = 0; i < rows.length; i++) {
    var item = stockItem(rows[i]);
    if (!item.resolved && item.product.toLowerCase() === product.toLowerCase()) {
      writeTableCells(sheet, rows[i].row, 3, [status, session.name, nowStamp()]);
      audit(session.name, 'stock.update', item.id, item.status + ' -> ' + status);
      return actionGetStock();
    }
  }
  var id = newRecordId('S');
  appendTableRow(sheet, [id, product, status, session.name, nowStamp(), 'FALSE', '', '']);
  audit(session.name, 'stock.add', id, status);
  return actionGetStock();
}

/** req: { id, resolved: boolean } */
function actionSetStockResolved(req, session) {
  if (typeof req.resolved !== 'boolean') throw fail('invalid', 'resolved must be true or false.', { field: 'resolved' });
  var sheet = stockSheet();
  var found = findTableRow(sheet, STOCK_HEADER.length, String(req.id || ''));
  if (!found) throw fail('not_found', 'That stock item no longer exists.');
  writeTableCells(sheet, found.row, 6, req.resolved ? ['TRUE', session.name, nowStamp()] : ['FALSE', '', '']);
  audit(session.name, req.resolved ? 'stock.resolve' : 'stock.reopen', found.cells[0], '');
  return actionGetStock();
}

// ---- 12_requests.js ----
// Customer requests (DECISIONS D-016, D-041). Minimal data: name, phone, product, dates, status.
// Any logged-in staff member can view, create and update status; only the manager can delete,
// change the purge period, or export. Names and phone numbers never appear in error messages or
// in the Audit tab (audit rows carry the request ID and status only). Fulfilled requests are
// deleted automatically after REQUESTS_PURGE_DAYS by purgeFulfilledRequests() (time-driven trigger).
// Columns: ID | Created At | Customer Name | Phone | Product | Status | Status Changed At | Status Changed By | Created By

var REQUEST_HEADER = ['ID', 'Created At', 'Customer Name', 'Phone', 'Product', 'Status', 'Status Changed At', 'Status Changed By', 'Created By'];
var REQUEST_STATUSES = ['open', 'contacted', 'fulfilled'];
var PURGE_DAYS_KEY = 'REQUESTS_PURGE_DAYS';
var DEFAULT_PURGE_DAYS = 30;

function requestsSheet() {
  return tableSheet('Requests', REQUEST_HEADER);
}

/**
 * North American numbers only: 10 digits (optionally +1 / 1 first), area code and exchange starting
 * 2-9. Returns "604-555-0123" or "" if invalid. Stored in that form: it starts with a digit (so no
 * formula-guard apostrophe is needed) and reads naturally in the sheet. Mirrors src/utils/phone.ts.
 */
function normalizePhone(value) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return '';
  var digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) return '';
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '';
  return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
}

function requestItem(r) {
  var c = r.cells;
  return {
    id: c[0], createdAt: c[1], customerName: c[2], phone: c[3], product: c[4],
    status: c[5], statusChangedAt: c[6], statusChangedBy: c[7], createdBy: c[8]
  };
}

function actionGetRequests() {
  var sheet = spreadsheet().getSheetByName('Requests');
  return sheet ? tableRows(sheet, REQUEST_HEADER.length).map(requestItem) : [];
}

/** req: { customerName, phone, product } */
function actionAddRequest(req, session) {
  var name = requiredText(req.customerName, 60, 'customerName', "the customer's name");
  var phone = normalizePhone(req.phone);
  if (!phone) throw fail('invalid', 'Enter a 10-digit North American phone number.', { field: 'phone' });
  var product = requiredText(req.product, 80, 'product', 'the product');
  var id = newRecordId('R');
  var stamp = nowStamp();
  appendTableRow(requestsSheet(), [id, stamp, name, phone, product, 'open', stamp, session.name, session.name]);
  audit(session.name, 'request.create', id, 'open');
  return actionGetRequests();
}

/** req: { id, status } */
function actionUpdateRequestStatus(req, session) {
  var status = String(req.status || '');
  if (REQUEST_STATUSES.indexOf(status) === -1) throw fail('invalid', 'Status must be open, contacted or fulfilled.', { field: 'status' });
  var sheet = requestsSheet();
  var found = findTableRow(sheet, REQUEST_HEADER.length, String(req.id || ''));
  if (!found) throw fail('not_found', 'That request no longer exists.');
  var before = found.cells[5];
  if (before !== status) {
    writeTableCells(sheet, found.row, 6, [status, nowStamp(), session.name]);
    audit(session.name, 'request.status', found.cells[0], before + ' -> ' + status);
  }
  return actionGetRequests();
}

/** req: { id }. Manager only (router). */
function actionDeleteRequest(req, session) {
  var sheet = requestsSheet();
  var found = findTableRow(sheet, REQUEST_HEADER.length, String(req.id || ''));
  if (!found) throw fail('not_found', 'That request no longer exists.');
  sheet.deleteRow(found.row);
  audit(session.name, 'request.delete', found.cells[0], '');
  return actionGetRequests();
}

function purgeDays() {
  var n = Number(scriptProps().getProperty(PURGE_DAYS_KEY));
  return n >= 1 && n <= 365 ? Math.floor(n) : DEFAULT_PURGE_DAYS;
}

function actionGetRequestSettings() {
  return { purgeDays: purgeDays() };
}

/** req: { purgeDays: 1-365 }. Manager only (router). */
function actionSetRequestSettings(req, session) {
  var n = Number(req.purgeDays);
  if (!(n >= 1 && n <= 365) || Math.floor(n) !== n) throw fail('invalid', 'Purge period must be 1 to 365 days.', { field: 'purgeDays' });
  var before = purgeDays();
  scriptProps().setProperty(PURGE_DAYS_KEY, String(n));
  audit(session.name, 'request.purgeDays', 'Requests', before + ' -> ' + n + ' days');
  return { purgeDays: n };
}

/**
 * Deletes fulfilled requests whose status changed more than purgeDays() ago. Run daily by the trigger
 * from installTriggers(); safe to run by hand. Logs only the count.
 */
function purgeFulfilledRequests() {
  return withScriptLock(function () {
    var sheet = spreadsheet().getSheetByName('Requests');
    var days = purgeDays();
    if (!sheet) return 0;
    var cutoff = Utilities.formatDate(new Date(Date.now() - days * 86400000), sheetTimeZone(), 'yyyy-MM-dd');
    var doomed = tableRows(sheet, REQUEST_HEADER.length).filter(function (r) {
      var item = requestItem(r);
      return item.status === 'fulfilled' && item.statusChangedAt && item.statusChangedAt.slice(0, 10) < cutoff;
    });
    for (var i = doomed.length - 1; i >= 0; i--) sheet.deleteRow(doomed[i].row);
    audit('(trigger)', 'request.purge', 'Requests', doomed.length + ' fulfilled request(s) older than ' + days + ' days deleted');
    return doomed.length;
  });
}

// ---- 13_cash.js ----
// End-of-day cash count (DECISIONS D-015, D-042). Money is ALWAYS integer cents; nothing here relates
// to sales or pay. One row per day in the CashCounts tab:
//   Date | Counted By | Updated At | one column per denomination (counts) | Total (cents) | Float (cents) | Difference (cents)
// Staff can add or update TODAY's count; the manager can view history, edit any past day, and set the
// target float. Every create/update is audited with the old and new totals.

var CASH_DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 200, 100, 25, 10, 5]; // $100 … 5¢ (no pennies)
var CASH_LABELS = ['$100', '$50', '$20', '$10', '$5', '$2', '$1', '25¢', '10¢', '5¢'];
var CASH_HEADER = ['Date', 'Counted By', 'Updated At'].concat(CASH_LABELS).concat(['Total (cents)', 'Float (cents)', 'Difference (cents)']);
var CASH_FLOAT_KEY = 'CASH_FLOAT_CENTS';
var CASH_MAX_PIECES = 10000;
var CASH_MAX_FLOAT = 10000000; // $100,000.00

function cashSheet() {
  return tableSheet('CashCounts', CASH_HEADER);
}

function floatCents() {
  var n = Number(scriptProps().getProperty(CASH_FLOAT_KEY));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Validates {"10000": n, …} and returns counts in CASH_DENOMINATIONS order. Pure. */
function parseCashCounts(input) {
  if (!input || typeof input !== 'object') throw fail('invalid', 'Missing counts.', { field: 'counts' });
  Object.keys(input).forEach(function (key) {
    if (CASH_DENOMINATIONS.indexOf(Number(key)) === -1) throw fail('invalid', 'Unknown denomination.', { field: 'counts' });
  });
  return CASH_DENOMINATIONS.map(function (d) {
    var raw = input[String(d)];
    var n = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > CASH_MAX_PIECES) {
      throw fail('invalid', 'Each count must be a whole number from 0 to ' + CASH_MAX_PIECES + '.', { field: 'counts' });
    }
    return n;
  });
}

/** Integer cents. Pure; mirrors totalCents() in src/utils/money.ts (parity-tested). */
function cashTotalCents(counts) {
  var total = 0;
  for (var i = 0; i < CASH_DENOMINATIONS.length; i++) total += CASH_DENOMINATIONS[i] * counts[i];
  return total;
}

/** "$1,234.56" / "-$5.00" from integer cents, for audit text. Pure. */
function centsText(cents) {
  var sign = cents < 0 ? '-' : '';
  var abs = Math.abs(cents);
  var dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + '$' + dollars + '.' + pad2(abs % 100);
}

function cashRowToCount(cells) {
  var counts = {};
  CASH_DENOMINATIONS.forEach(function (d, i) { counts[String(d)] = Number(cells[3 + i]) || 0; });
  var base = 3 + CASH_DENOMINATIONS.length;
  return {
    date: String(cells[0]),
    countedBy: String(cells[1]),
    updatedAt: String(cells[2]),
    counts: counts,
    totalCents: Number(cells[base]) || 0,
    floatCents: Number(cells[base + 1]) || 0,
    differenceCents: Number(cells[base + 2]) || 0
  };
}

function findCashRow(date) {
  var sheet = spreadsheet().getSheetByName('CashCounts');
  if (!sheet) return null;
  var rows = tableRows(sheet, CASH_HEADER.length);
  for (var i = 0; i < rows.length; i++) if (rows[i].cells[0] === date) return rows[i];
  return null;
}

/** Any staff: today's count (if saved) and the current target float. */
function actionGetCashToday() {
  var today = todayStr();
  var found = findCashRow(today);
  return { date: today, floatCents: floatCents(), count: found ? cashRowToCount(found.cells) : null };
}

/**
 * req: { counts, date? }. Staff: today only (date ignored unless it is today). Manager: any real date
 * up to today. Saving a day that already has a count updates it (one count per day).
 */
function actionSaveCashCount(req, session) {
  var today = todayStr();
  var date = req.date ? String(req.date) : today;
  if (!parseDateStr(date)) throw fail('invalid', 'Invalid date.', { field: 'date' });
  if (date > today) throw fail('invalid', "Future dates can't be counted.", { field: 'date' });
  if (date !== today && session.role !== ROLES.MANAGER) throw fail('forbidden', "Only a manager can change a past day's count.");

  var counts = parseCashCounts(req.counts);
  var total = cashTotalCents(counts);
  var existing = findCashRow(date);
  // The float in effect when the day was first counted stays with that day.
  var target = existing ? cashRowToCount(existing.cells).floatCents : floatCents();
  var row = [date, session.name, nowStamp()].concat(counts).concat([total, target, total - target]);

  var sheet = cashSheet();
  if (existing) {
    var before = cashRowToCount(existing.cells);
    sheet.getRange(existing.row, 1, 1, 3).setNumberFormat('@');
    sheet.getRange(existing.row, 1, 1, row.length).setValues([[safeCellText(row[0]), safeCellText(row[1]), safeCellText(row[2])].concat(row.slice(3))]);
    audit(session.name, 'cash.update', date, centsText(before.totalCents) + ' -> ' + centsText(total) + ' (difference ' + centsText(total - target) + ')');
  } else {
    var next = sheet.getLastRow() + 1;
    sheet.getRange(next, 1, 1, 3).setNumberFormat('@');
    sheet.getRange(next, 1, 1, row.length).setValues([[safeCellText(row[0]), safeCellText(row[1]), safeCellText(row[2])].concat(row.slice(3))]);
    audit(session.name, 'cash.create', date, centsText(total) + ' (difference ' + centsText(total - target) + ')');
  }
  return actionGetCashDay(date);
}

function actionGetCashDay(date) {
  var found = findCashRow(date);
  return { date: date, floatCents: floatCents(), count: found ? cashRowToCount(found.cells) : null };
}

/** Manager: counts for a month ("YYYY-MM"), newest first. */
function actionGetCashHistory(req) {
  var month = String(req.month || todayStr().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw fail('invalid', 'Invalid month.', { field: 'month' });
  var sheet = spreadsheet().getSheetByName('CashCounts');
  var rows = sheet ? tableRows(sheet, CASH_HEADER.length) : [];
  return rows
    .map(function (r) { return cashRowToCount(r.cells); })
    .filter(function (c) { return c.date.slice(0, 7) === month; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
}

/** Manager: req { floatCents } (a JSON number of integer cents, 0 to $100,000; strings are refused so
 * dollars can't be mistaken for cents). */
function actionSetCashSettings(req, session) {
  var n = req.floatCents;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > CASH_MAX_FLOAT) throw fail('invalid', 'Float must be between $0.00 and $100,000.00.', { field: 'floatCents' });
  var before = floatCents();
  scriptProps().setProperty(CASH_FLOAT_KEY, String(n));
  audit(session.name, 'cash.float', 'CashCounts', centsText(before) + ' -> ' + centsText(n));
  return { floatCents: n };
}

// ---- 90_api.js ----
// HTTP entry points. Every action is a POST with a JSON body sent as text/plain (no CORS preflight):
//   { action, token, ...params }  ->  {status: "success", data} | {status: "error", code, message} |
//                                     {status: "conflict", code: "conflict", previousData}
// The only action that works without a token is "login". doGet returns no data at all; the app uses
// it only to check that the URL points at this version of the backend.

var ACTIONS = {
  login: { auth: false, write: true, handler: actionLogin },
  getEmployees: { auth: true, handler: actionGetEmployees },
  getTimesheet: { auth: true, handler: actionGetTimesheet },
  saveShift: { auth: true, write: true, handler: actionSaveShift },
  deleteShift: { auth: true, write: true, manager: true, handler: actionDeleteShift },
  getTimetable: { auth: true, handler: actionGetTimetable },
  updateTimetable: { auth: true, write: true, manager: true, handler: actionUpdateTimetable },
  setPin: { auth: true, write: true, manager: true, handler: actionSetPin },
  unlockEmployee: { auth: true, write: true, manager: true, handler: actionUnlockEmployee },
  setEmployeeActive: { auth: true, write: true, manager: true, handler: actionSetEmployeeActive },
  getAudit: { auth: true, manager: true, handler: actionGetAudit },
  getStock: { auth: true, handler: actionGetStock },
  addStock: { auth: true, write: true, handler: actionAddStock },
  setStockResolved: { auth: true, write: true, handler: actionSetStockResolved },
  getRequests: { auth: true, handler: actionGetRequests },
  addRequest: { auth: true, write: true, handler: actionAddRequest },
  updateRequestStatus: { auth: true, write: true, handler: actionUpdateRequestStatus },
  deleteRequest: { auth: true, write: true, manager: true, handler: actionDeleteRequest },
  getRequestSettings: { auth: true, manager: true, handler: actionGetRequestSettings },
  setRequestSettings: { auth: true, write: true, manager: true, handler: actionSetRequestSettings },
  getCashToday: { auth: true, handler: actionGetCashToday },
  saveCashCount: { auth: true, write: true, handler: actionSaveCashCount },
  getCashHistory: { auth: true, manager: true, handler: actionGetCashHistory },
  setCashSettings: { auth: true, write: true, manager: true, handler: actionSetCashSettings }
};

function jsonOutput(body) {
  body.apiVersion = API_VERSION;
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonOutput({ status: 'error', code: 'use_post', message: 'This backend only accepts POST requests.' });
}

function doPost(e) {
  return jsonOutput(handleRequest(e && e.postData ? e.postData.contents : ''));
}

/** Pure request handling, separate from ContentService so tests can call it directly. */
function handleRequest(rawBody) {
  var req;
  try {
    req = JSON.parse(rawBody || '');
  } catch (err) {
    return { status: 'error', code: 'invalid', message: 'Request body must be JSON.' };
  }
  if (!req || typeof req !== 'object') return { status: 'error', code: 'invalid', message: 'Request body must be JSON.' };

  var def = Object.prototype.hasOwnProperty.call(ACTIONS, req.action) ? ACTIONS[req.action] : null;
  if (!def) return { status: 'error', code: 'invalid', message: 'Unknown action.' };

  try {
    var run = function () {
      var session = null;
      if (def.auth) {
        session = authenticate(req.token);
        if (def.manager && session.role !== ROLES.MANAGER) throw fail('forbidden', 'Only a manager can do that.');
      }
      return def.handler(req, session);
    };
    var result = def.write ? withScriptLock(run) : run();
    if (result && result.conflict === true) {
      return {
        status: 'conflict',
        code: 'conflict',
        message: 'That shift is already logged with different details.',
        previousData: result.previousData
      };
    }
    return { status: 'success', data: result === undefined ? null : result };
  } catch (err) {
    if (err instanceof ApiFail) {
      var body = { status: 'error', code: err.code, message: err.message };
      if (err.extra) {
        for (var k in err.extra) {
          if (Object.prototype.hasOwnProperty.call(err.extra, k)) body[k] = err.extra[k];
        }
      }
      return body;
    }
    // Unexpected failure: log the error only (never the request body, which may hold a PIN or token).
    console.error('Unhandled error in action ' + req.action + ': ' + (err && err.message ? err.message : err));
    return { status: 'error', code: 'server_error', message: 'Something went wrong on the server. Please try again.' };
  }
}

// ---- 95_setup.js ----
// One-time functions the owner runs by hand from the Apps Script editor (select the function in the
// toolbar, then Run). See docs/MORNING_CHECKLIST.md. Nothing here is reachable over HTTP.

/**
 * Sets the first manager's PIN without ever putting it in code:
 *   1. Project Settings > Script properties: add SETUP_MANAGER_NAME (exactly as in the Employees tab)
 *      and SETUP_MANAGER_PIN (6 digits).
 *   2. Run setManagerPin. It stores only a salted hash, marks that employee as manager and active,
 *      then deletes both SETUP_ properties.
 */
function setManagerPin() {
  var props = scriptProps();
  var name = props.getProperty(PROP_KEYS.SETUP_MANAGER_NAME);
  var pin = props.getProperty(PROP_KEYS.SETUP_MANAGER_PIN);
  try {
    if (!name || !pin) {
      throw new Error('Add the script properties ' + PROP_KEYS.SETUP_MANAGER_NAME + ' and ' + PROP_KEYS.SETUP_MANAGER_PIN + ' first.');
    }
    return withScriptLock(function () {
      var employee = findEmployee(name);
      if (!employee) throw new Error('"' + cleanName(name) + '" is not in the Employees tab (column A).');
      validateNewPin(pin);
      setEmployeeCell(employee, 'Role', ROLES.MANAGER);
      setEmployeeCell(employee, 'Active', 'TRUE');
      setEmployeePin(employee, pin);
      getOrCreateSecret(PROP_KEYS.TOKEN_SECRET);
      audit('(setup)', 'setup.managerPin', employee.name, 'manager PIN set from the script editor');
      Logger.log('Manager PIN set for ' + employee.name + '. The SETUP_ properties have been deleted.');
      return employee.name;
    });
  } catch (err) {
    var message = err instanceof ApiFail ? err.message : (err && err.message) || String(err);
    Logger.log('setManagerPin failed: ' + message);
    throw new Error(message);
  } finally {
    props.deleteProperty(PROP_KEYS.SETUP_MANAGER_PIN);
    props.deleteProperty(PROP_KEYS.SETUP_MANAGER_NAME);
  }
}

// ---- 96_triggers.js ----
// Time-driven triggers. Claude can't install them; the owner runs installTriggers() once from the
// Apps Script editor (see docs/MORNING_CHECKLIST.md). Re-running replaces our triggers, never
// duplicates them, and leaves any other triggers alone.

var TRIGGERS = [
  { handler: 'purgeFulfilledRequests', every: 'days', n: 1, atHour: 3 }
];

function installTriggers() {
  var ours = TRIGGERS.map(function (t) { return t.handler; });
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (ours.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  TRIGGERS.forEach(function (t) {
    var builder = ScriptApp.newTrigger(t.handler).timeBased();
    if (t.every === 'days') builder = builder.everyDays(t.n).atHour(t.atHour);
    else builder = builder.everyHours(t.n);
    builder.create();
  });
  Logger.log('Installed triggers: ' + ours.join(', '));
  return ours;
}
