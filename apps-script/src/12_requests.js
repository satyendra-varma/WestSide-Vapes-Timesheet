// Customer requests (DECISIONS D-016, D-041). Minimal data: name, phone, product, dates, status.
// Any logged-in staff member can view, create and update status; only the manager can delete,
// change the purge period, or export. Names and phone numbers never appear in error messages or
// in the Audit tab (audit rows carry the request ID and status only). Fulfilled requests are
// deleted automatically after REQUESTS_PURGE_DAYS by purgeFulfilledRequests() (time-driven trigger).
// Columns: ID | Created At | Customer Name | Phone | Product | Status | Status Changed At | Status Changed By | Created By

var REQUEST_HEADER = ['ID', 'Created At', 'Customer Name', 'Phone', 'Product', 'Status', 'Status Changed At', 'Status Changed By', 'Created By'];
var REQUEST_STATUSES = ['open', 'contacted', 'fulfilled'];
var PURGE_DAYS_KEY = 'REQUESTS_PURGE_DAYS';
var DEFAULT_PURGE_DAYS = 30;

function requestsSheet() {
  return tableSheet('Requests', REQUEST_HEADER);
}

/**
 * North American numbers only: 10 digits (optionally +1 / 1 first), area code and exchange starting
 * 2-9. Returns "604-555-0123" or "" if invalid. Stored in that form: it starts with a digit (so no
 * formula-guard apostrophe is needed) and reads naturally in the sheet. Mirrors src/utils/phone.ts.
 */
function normalizePhone(value) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return '';
  var digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) return '';
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '';
  return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
}

function requestItem(r) {
  var c = r.cells;
  return {
    id: c[0], createdAt: c[1], customerName: c[2], phone: c[3], product: c[4],
    status: c[5], statusChangedAt: c[6], statusChangedBy: c[7], createdBy: c[8]
  };
}

function actionGetRequests() {
  var sheet = spreadsheet().getSheetByName('Requests');
  return sheet ? tableRows(sheet, REQUEST_HEADER.length).map(requestItem) : [];
}

/** req: { customerName, phone, product } */
function actionAddRequest(req, session) {
  var name = requiredText(req.customerName, 60, 'customerName', "the customer's name");
  var phone = normalizePhone(req.phone);
  if (!phone) throw fail('invalid', 'Enter a 10-digit North American phone number.', { field: 'phone' });
  var product = requiredText(req.product, 80, 'product', 'the product');
  var id = newRecordId('R');
  var stamp = nowStamp();
  appendTableRow(requestsSheet(), [id, stamp, name, phone, product, 'open', stamp, session.name, session.name]);
  audit(session.name, 'request.create', id, 'open');
  return actionGetRequests();
}

/** req: { id, status } */
function actionUpdateRequestStatus(req, session) {
  var status = String(req.status || '');
  if (REQUEST_STATUSES.indexOf(status) === -1) throw fail('invalid', 'Status must be open, contacted or fulfilled.', { field: 'status' });
  var sheet = requestsSheet();
  var found = findTableRow(sheet, REQUEST_HEADER.length, String(req.id || ''));
  if (!found) throw fail('not_found', 'That request no longer exists.');
  var before = found.cells[5];
  if (before !== status) {
    writeTableCells(sheet, found.row, 6, [status, nowStamp(), session.name]);
    audit(session.name, 'request.status', found.cells[0], before + ' -> ' + status);
  }
  return actionGetRequests();
}

/** req: { id }. Manager only (router). */
function actionDeleteRequest(req, session) {
  var sheet = requestsSheet();
  var found = findTableRow(sheet, REQUEST_HEADER.length, String(req.id || ''));
  if (!found) throw fail('not_found', 'That request no longer exists.');
  sheet.deleteRow(found.row);
  audit(session.name, 'request.delete', found.cells[0], '');
  return actionGetRequests();
}

function purgeDays() {
  var n = Number(scriptProps().getProperty(PURGE_DAYS_KEY));
  return n >= 1 && n <= 365 ? Math.floor(n) : DEFAULT_PURGE_DAYS;
}

function actionGetRequestSettings() {
  return { purgeDays: purgeDays() };
}

/** req: { purgeDays: 1-365 }. Manager only (router). */
function actionSetRequestSettings(req, session) {
  var n = Number(req.purgeDays);
  if (!(n >= 1 && n <= 365) || Math.floor(n) !== n) throw fail('invalid', 'Purge period must be 1 to 365 days.', { field: 'purgeDays' });
  var before = purgeDays();
  scriptProps().setProperty(PURGE_DAYS_KEY, String(n));
  audit(session.name, 'request.purgeDays', 'Requests', before + ' -> ' + n + ' days');
  return { purgeDays: n };
}

/**
 * Deletes fulfilled requests whose status changed more than purgeDays() ago. Run daily by the trigger
 * from installTriggers(); safe to run by hand. Logs only the count.
 */
function purgeFulfilledRequests() {
  return withScriptLock(function () {
    var sheet = spreadsheet().getSheetByName('Requests');
    var days = purgeDays();
    if (!sheet) return 0;
    var cutoff = Utilities.formatDate(new Date(Date.now() - days * 86400000), sheetTimeZone(), 'yyyy-MM-dd');
    var doomed = tableRows(sheet, REQUEST_HEADER.length).filter(function (r) {
      var item = requestItem(r);
      return item.status === 'fulfilled' && item.statusChangedAt && item.statusChangedAt.slice(0, 10) < cutoff;
    });
    for (var i = doomed.length - 1; i >= 0; i--) sheet.deleteRow(doomed[i].row);
    audit('(trigger)', 'request.purge', 'Requests', doomed.length + ' fulfilled request(s) older than ' + days + ' days deleted');
    return doomed.length;
  });
}
