// End-of-day cash count (DECISIONS D-015, D-042). Money is ALWAYS integer cents; nothing here relates
// to sales or pay. One row per day in the CashCounts tab:
//   Date | Counted By | Updated At | one column per denomination (counts) | Total (cents) | Float (cents) | Difference (cents)
// Staff can add or update TODAY's count; the manager can view history, edit any past day, and set the
// target float. Every create/update is audited with the old and new totals.

var CASH_DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 200, 100, 25, 10, 5]; // $100 … 5¢ (no pennies)
var CASH_LABELS = ['$100', '$50', '$20', '$10', '$5', '$2', '$1', '25¢', '10¢', '5¢'];
var CASH_HEADER = ['Date', 'Counted By', 'Updated At'].concat(CASH_LABELS).concat(['Total (cents)', 'Float (cents)', 'Difference (cents)']);
var CASH_FLOAT_KEY = 'CASH_FLOAT_CENTS';
var CASH_MAX_PIECES = 10000;
var CASH_MAX_FLOAT = 10000000; // $100,000.00

function cashSheet() {
  return tableSheet('CashCounts', CASH_HEADER);
}

function floatCents() {
  var n = Number(scriptProps().getProperty(CASH_FLOAT_KEY));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Validates {"10000": n, …} and returns counts in CASH_DENOMINATIONS order. Pure. */
function parseCashCounts(input) {
  if (!input || typeof input !== 'object') throw fail('invalid', 'Missing counts.', { field: 'counts' });
  Object.keys(input).forEach(function (key) {
    if (CASH_DENOMINATIONS.indexOf(Number(key)) === -1) throw fail('invalid', 'Unknown denomination.', { field: 'counts' });
  });
  return CASH_DENOMINATIONS.map(function (d) {
    var raw = input[String(d)];
    var n = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > CASH_MAX_PIECES) {
      throw fail('invalid', 'Each count must be a whole number from 0 to ' + CASH_MAX_PIECES + '.', { field: 'counts' });
    }
    return n;
  });
}

/** Integer cents. Pure; mirrors totalCents() in src/utils/money.ts (parity-tested). */
function cashTotalCents(counts) {
  var total = 0;
  for (var i = 0; i < CASH_DENOMINATIONS.length; i++) total += CASH_DENOMINATIONS[i] * counts[i];
  return total;
}

/** "$1,234.56" / "-$5.00" from integer cents, for audit text. Pure. */
function centsText(cents) {
  var sign = cents < 0 ? '-' : '';
  var abs = Math.abs(cents);
  var dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + '$' + dollars + '.' + pad2(abs % 100);
}

function cashRowToCount(cells) {
  var counts = {};
  CASH_DENOMINATIONS.forEach(function (d, i) { counts[String(d)] = Number(cells[3 + i]) || 0; });
  var base = 3 + CASH_DENOMINATIONS.length;
  return {
    date: String(cells[0]).slice(0, 10), // tolerate a hand-edited date cell ("2026-10-09 00:00")
    countedBy: String(cells[1]),
    updatedAt: String(cells[2]),
    counts: counts,
    totalCents: Number(cells[base]) || 0,
    floatCents: Number(cells[base + 1]) || 0,
    differenceCents: Number(cells[base + 2]) || 0
  };
}

function findCashRow(date) {
  var sheet = spreadsheet().getSheetByName('CashCounts');
  if (!sheet) return null;
  var rows = tableRows(sheet, CASH_HEADER.length);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].cells[0]).slice(0, 10) === date) return rows[i];
  return null;
}

/** Any staff: today's count (if saved) and the current target float. */
function actionGetCashToday() {
  var today = todayStr();
  var found = findCashRow(today);
  return { date: today, floatCents: floatCents(), count: found ? cashRowToCount(found.cells) : null };
}

/**
 * req: { counts, date? }. Staff: today only (date ignored unless it is today). Manager: any real date
 * up to today. Saving a day that already has a count updates it (one count per day).
 */
function actionSaveCashCount(req, session) {
  var today = todayStr();
  var date = req.date ? String(req.date) : today;
  if (!parseDateStr(date)) throw fail('invalid', 'Invalid date.', { field: 'date' });
  if (date > today) throw fail('invalid', "Future dates can't be counted.", { field: 'date' });
  if (date !== today && session.role !== ROLES.MANAGER) throw fail('forbidden', "Only a manager can change a past day's count.");

  var counts = parseCashCounts(req.counts);
  var total = cashTotalCents(counts);
  var existing = findCashRow(date);
  // The float in effect when the day was first counted stays with that day.
  var target = existing ? cashRowToCount(existing.cells).floatCents : floatCents();
  var row = [date, session.name, nowStamp()].concat(counts).concat([total, target, total - target]);

  var sheet = cashSheet();
  if (existing) {
    var before = cashRowToCount(existing.cells);
    sheet.getRange(existing.row, 1, 1, 3).setNumberFormat('@');
    sheet.getRange(existing.row, 1, 1, row.length).setValues([[safeCellText(row[0]), safeCellText(row[1]), safeCellText(row[2])].concat(row.slice(3))]);
    audit(session.name, 'cash.update', date, centsText(before.totalCents) + ' -> ' + centsText(total) + ' (difference ' + centsText(total - target) + ')');
  } else {
    var next = sheet.getLastRow() + 1;
    sheet.getRange(next, 1, 1, 3).setNumberFormat('@');
    sheet.getRange(next, 1, 1, row.length).setValues([[safeCellText(row[0]), safeCellText(row[1]), safeCellText(row[2])].concat(row.slice(3))]);
    audit(session.name, 'cash.create', date, centsText(total) + ' (difference ' + centsText(total - target) + ')');
  }
  return actionGetCashDay(date);
}

function actionGetCashDay(date) {
  var found = findCashRow(date);
  return { date: date, floatCents: floatCents(), count: found ? cashRowToCount(found.cells) : null };
}

/** Manager: counts for a month ("YYYY-MM"), newest first. */
function actionGetCashHistory(req) {
  var month = String(req.month || todayStr().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw fail('invalid', 'Invalid month.', { field: 'month' });
  var sheet = spreadsheet().getSheetByName('CashCounts');
  var rows = sheet ? tableRows(sheet, CASH_HEADER.length) : [];
  return rows
    .map(function (r) { return cashRowToCount(r.cells); })
    .filter(function (c) { return c.date.slice(0, 7) === month; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
}

/** Manager: req { floatCents } (a JSON number of integer cents, 0 to $100,000; strings are refused so
 * dollars can't be mistaken for cents). */
function actionSetCashSettings(req, session) {
  var n = req.floatCents;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > CASH_MAX_FLOAT) throw fail('invalid', 'Float must be between $0.00 and $100,000.00.', { field: 'floatCents' });
  var before = floatCents();
  scriptProps().setProperty(CASH_FLOAT_KEY, String(n));
  audit(session.name, 'cash.float', 'CashCounts', centsText(before) + ' -> ' + centsText(n));
  return { floatCents: n };
}
