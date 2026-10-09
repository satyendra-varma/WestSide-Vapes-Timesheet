// Missed-shift-log reminders, EMAIL ONLY via MailApp (DECISIONS D-017, D-044). No SMS, no paid services.
//
// sendShiftReminders() runs hourly (installTriggers). For yesterday and today it looks up who is
// rostered (Timetable tab) for each shift. If the shift's end time + the grace period has passed and
// nobody has logged that slot, the rostered employee gets ONE email (the Reminders tab records every
// email sent, so nobody is emailed twice for the same shift). Inactive employees and employees with no
// valid address in the Employees tab's Email column are skipped. Off until the manager enables it.

var SHIFT_END_TIMES = { Morning: '16:00', Evening: '23:00' }; // mirrors SHOP_INFO in src/config.ts
var REMINDER_HEADER = ['Key', 'Date', 'Shift', 'Employee', 'Sent At'];
var REMINDERS_ENABLED_KEY = 'REMINDERS_ENABLED';
var REMINDER_GRACE_KEY = 'REMINDER_GRACE_MINUTES';
var DEFAULT_GRACE_MINUTES = 60;
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "2026-10-09", "23:00", +60 -> "2026-10-10 00:00". Pure calendar arithmetic (UTC as a calculator). */
function addMinutesLocal(dateStr, hhmm, minutes) {
  var d = parseDateStr(dateStr);
  var t = /^(\d{2}):(\d{2})$/.exec(hhmm);
  var ms = Date.UTC(d.year, d.month - 1, d.day, Number(t[1]), Number(t[2])) + minutes * 60000;
  var x = new Date(ms);
  return x.getUTCFullYear() + '-' + pad2(x.getUTCMonth() + 1) + '-' + pad2(x.getUTCDate()) + ' ' + pad2(x.getUTCHours()) + ':' + pad2(x.getUTCMinutes());
}

/** Weekday name of a calendar date (time-zone independent). */
function dayNameOf(dateStr) {
  var d = parseDateStr(dateStr);
  return DAY_NAMES[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
}

function remindersEnabled() {
  return scriptProps().getProperty(REMINDERS_ENABLED_KEY) === 'true';
}

function graceMinutes() {
  var n = Number(scriptProps().getProperty(REMINDER_GRACE_KEY));
  return Number.isInteger(n) && n >= 15 && n <= 720 ? n : DEFAULT_GRACE_MINUTES;
}

function reminderKey(date, shift, employee) {
  return date + '|' + shift + '|' + employee.key;
}

/** Hourly trigger entry point. Returns how many emails were sent (and why it stopped, if it did). */
function sendShiftReminders() {
  if (!remindersEnabled()) return { sent: 0, note: 'disabled' };
  return withScriptLock(function () {
    var tz = sheetTimeZone();
    var nowLocal = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
    var today = nowLocal.slice(0, 10);
    var yesterday = addMinutesLocal(today, '00:00', -1440).slice(0, 10);
    var grace = graceMinutes();
    var roster = actionGetTimetable();
    var logSheet = tableSheet('Reminders', REMINDER_HEADER);
    var sentKeys = {};
    tableRows(logSheet, REMINDER_HEADER.length).forEach(function (r) { sentKeys[r.cells[0]] = true; });

    var sent = 0;
    var note = '';
    [yesterday, today].forEach(function (date) {
      if (note) return;
      var rosterDay = roster.filter(function (d) { return d.dayName === dayNameOf(date); })[0];
      if (!rosterDay) return;
      SHIFT_TYPES.forEach(function (shift) {
        if (note) return;
        var name = shift === 'Morning' ? rosterDay.morning : rosterDay.evening;
        if (!name) return;
        if (nowLocal < addMinutesLocal(date, SHIFT_END_TIMES[shift], grace)) return; // not overdue yet
        var employee = findEmployee(name);
        if (!employee || !employee.active || !EMAIL_PATTERN.test(employee.email)) return;
        var key = reminderKey(date, shift, employee);
        if (sentKeys[key]) return;
        var parsed = parseDateStr(date);
        var sheet = getMonthSheet(parsed.monthYear, false);
        if (sheet) {
          var slot = readSlot(sheet, parsed.day, shift);
          if (slot.name || slot.inTime || slot.outTime) return; // logged (by anyone)
        }
        if (MailApp.getRemainingDailyQuota() < 1) {
          note = 'daily email quota used up';
          return;
        }
        MailApp.sendEmail(
          employee.email,
          'Reminder: log your ' + shift + ' shift (' + date + ')',
          'Hi ' + employee.name + ',\n\n' +
          'Your ' + shift + ' shift on ' + dayNameOf(date) + ' ' + date + ' (ended ' + SHIFT_END_TIMES[shift] + ') ' +
          "hasn't been logged yet. Please log it in the WestSide Vapes timesheet app so your hours are recorded.\n\n" +
          "If you didn't work this shift, please let the manager know.\n\n" +
          '(Automatic reminder: please don\'t reply.)'
        );
        appendTableRow(logSheet, [key, date, shift, employee.name, nowStamp()]);
        sentKeys[key] = true;
        sent += 1;
      });
    });
    if (sent > 0 || note) audit('(trigger)', 'reminder.run', 'Reminders', sent + ' email(s) sent' + (note ? '; stopped: ' + note : ''));
    return { sent: sent, note: note };
  });
}

/** Manager: current settings plus who would be skipped for lack of an email address. */
function actionGetReminderSettings() {
  var roster = actionGetTimetable();
  var rostered = {};
  roster.forEach(function (d) { [d.morning, d.evening].forEach(function (n) { if (n) rostered[normalizeName(n)] = true; }); });
  var missingEmail = readEmployees()
    .filter(function (e) { return e.active && rostered[e.key] && !EMAIL_PATTERN.test(e.email); })
    .map(function (e) { return e.name; });
  var triggerInstalled = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sendShiftReminders'; });
  return { enabled: remindersEnabled(), graceMinutes: graceMinutes(), missingEmail: missingEmail, triggerInstalled: triggerInstalled };
}

/** Manager: req { enabled: boolean, graceMinutes: 15-720 }. */
function actionSetReminderSettings(req, session) {
  if (typeof req.enabled !== 'boolean') throw fail('invalid', 'enabled must be true or false.', { field: 'enabled' });
  var g = req.graceMinutes;
  if (typeof g !== 'number' || !Number.isInteger(g) || g < 15 || g > 720) throw fail('invalid', 'Grace period must be 15 to 720 minutes.', { field: 'graceMinutes' });
  scriptProps().setProperty(REMINDERS_ENABLED_KEY, req.enabled ? 'true' : 'false');
  scriptProps().setProperty(REMINDER_GRACE_KEY, String(g));
  audit(session.name, 'reminder.settings', 'Reminders', (req.enabled ? 'enabled' : 'disabled') + ', grace ' + g + ' min');
  return actionGetReminderSettings();
}
