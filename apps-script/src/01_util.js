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
