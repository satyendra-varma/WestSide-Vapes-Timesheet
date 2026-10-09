// Stock tab: low / out-of-stock list. Any logged-in staff member can add items and tick them resolved.
// Columns: ID | Product | Status | Noted By | Noted At | Resolved | Resolved By | Resolved At

var STOCK_HEADER = ['ID', 'Product', 'Status', 'Noted By', 'Noted At', 'Resolved', 'Resolved By', 'Resolved At'];
var STOCK_STATUSES = ['low', 'out'];

function stockSheet() {
  return tableSheet('Stock', STOCK_HEADER);
}

function stockItem(r) {
  var c = r.cells;
  return {
    id: c[0], product: c[1], status: c[2], notedBy: c[3], notedAt: c[4],
    resolved: String(c[5]).toUpperCase() === 'TRUE', resolvedBy: c[6], resolvedAt: c[7]
  };
}

function actionGetStock() {
  var sheet = spreadsheet().getSheetByName('Stock');
  return sheet ? tableRows(sheet, STOCK_HEADER.length).map(stockItem) : [];
}

/** req: { product, status: "low"|"out" }. An open item for the same product is updated instead of duplicated. */
function actionAddStock(req, session) {
  var product = requiredText(req.product, 80, 'product', 'a product name');
  var status = String(req.status || '');
  if (STOCK_STATUSES.indexOf(status) === -1) throw fail('invalid', 'Status must be low or out.', { field: 'status' });

  var sheet = stockSheet();
  var rows = tableRows(sheet, STOCK_HEADER.length);
  for (var i = 0; i < rows.length; i++) {
    var item = stockItem(rows[i]);
    if (!item.resolved && item.product.toLowerCase() === product.toLowerCase()) {
      writeTableCells(sheet, rows[i].row, 3, [status, session.name, nowStamp()]);
      audit(session.name, 'stock.update', item.id, item.status + ' -> ' + status);
      return actionGetStock();
    }
  }
  var id = newRecordId('S');
  appendTableRow(sheet, [id, product, status, session.name, nowStamp(), 'FALSE', '', '']);
  audit(session.name, 'stock.add', id, status);
  return actionGetStock();
}

/** req: { id, resolved: boolean } */
function actionSetStockResolved(req, session) {
  if (typeof req.resolved !== 'boolean') throw fail('invalid', 'resolved must be true or false.', { field: 'resolved' });
  var sheet = stockSheet();
  var found = findTableRow(sheet, STOCK_HEADER.length, String(req.id || ''));
  if (!found) throw fail('not_found', 'That stock item no longer exists.');
  writeTableCells(sheet, found.row, 6, req.resolved ? ['TRUE', session.name, nowStamp()] : ['FALSE', '', '']);
  audit(session.name, req.resolved ? 'stock.resolve' : 'stock.reopen', found.cells[0], '');
  return actionGetStock();
}
