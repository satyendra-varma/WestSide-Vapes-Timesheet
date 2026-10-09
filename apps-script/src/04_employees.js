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
