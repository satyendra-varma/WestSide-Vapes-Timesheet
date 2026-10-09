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
