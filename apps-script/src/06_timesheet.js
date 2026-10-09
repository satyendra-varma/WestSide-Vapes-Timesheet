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

function describeSlot(slot) {
  return slot.name ? slot.name + ' ' + (slot.inTime || '--:--') + '-' + (slot.outTime || '--:--') : 'empty';
}

/**
 * req: { date: "YYYY-MM-DD", shift, name, inTime, outTime, forceOverwrite }
 * Staff can only log their own shifts and can't replace someone else's. Managers can do both.
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

/** req: { date, shift }. Manager only (enforced by the router). */
function actionDeleteShift(req, session) {
  var date = parseDateStr(req.date);
  if (!date) throw fail('invalid', 'Invalid date.', { field: 'date' });
  var cols = shiftColumns(req.shift);
  var sheet = getMonthSheet(date.monthYear, false);
  if (!sheet) throw fail('not_found', 'No shifts are logged for that month.');
  var previous = readSlot(sheet, date.day, req.shift);
  if (!previous.name && !previous.inTime && !previous.outTime) throw fail('not_found', 'That shift is already empty.');
  sheet.getRange(MONTH_LAYOUT.FIRST_DAY_ROW + date.day - 1, cols.name, 1, 3).setValues([['', '', '']]);
  audit(session.name, 'shift.delete', req.date + ' ' + req.shift, 'was: ' + describeSlot(previous));
  return { previousData: previous };
}
