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
