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
