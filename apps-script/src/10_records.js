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
