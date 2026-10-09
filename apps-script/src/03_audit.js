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
