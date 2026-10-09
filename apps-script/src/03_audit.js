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

