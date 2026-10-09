// Additive minute columns and totals on month tabs (and the Template), so the sheet itself sums whole
// minutes exactly like the app (DECISIONS D-001, D-021, D-035). Existing columns A-I are never touched.
//
//   J "Morning Min", K "Evening Min": integer minutes per shift by formula (past-midnight safe,
//     "" when a time is missing, "CHECK" when a time can't be read).
//   M-Q: totals. Row 1 = all staff, row 2 = headers, rows 3-33 = one row per employee in this month
//     (filled by array formulas anchored in row 3). N = 1st-15th, O = 16th-end, P = month (minutes),
//     Q = month as h:mm.
// No rounded decimal hours anywhere. Run migrateSheets() once (owner) for existing tabs; new month
// tabs get the columns when they're created.

var MINUTES_FIRST_COL = 10; // J
var SUMMARY_FIRST_COL = 13; // M
var SUMMARY_LAST_COL = 17; // Q
var MONTH_LAST_ROW = MONTH_LAYOUT.FIRST_DAY_ROW + 30; // row 33 = day 31
var FIRST_HALF_LAST_ROW = MONTH_LAYOUT.FIRST_DAY_ROW + 14; // row 17 = day 15

/** Minutes formula for one row, e.g. minuteFormula('C', 'D', 3). */
function minuteFormula(inCol, outCol, row) {
  var a = inCol + row;
  var b = outCol + row;
  return '=IF(OR(' + a + '="",' + b + '=""),"",IFERROR(MOD(ROUND((TIMEVALUE(TEXT(' + b + ',"HH:mm"))-TIMEVALUE(TEXT(' + a + ',"HH:mm")))*1440),1440),"CHECK"))';
}

/** Everything the migration writes, as rectangular blocks of values or formulas (pure; tested). */
function monthFormulaBlocks() {
  var first = MONTH_LAYOUT.FIRST_DAY_ROW;
  var last = MONTH_LAST_ROW;
  var half = FIRST_HALF_LAST_ROW;
  var minuteRows = [];
  for (var r = first; r <= last; r++) minuteRows.push([minuteFormula('C', 'D', r), minuteFormula('G', 'H', r)]);

  var names = 'M' + first + ':M' + last;
  var sumIf = function (from, to) {
    return 'SUMIF(B' + from + ':B' + to + ',' + names + ',J' + from + ':J' + to + ')+SUMIF(F' + from + ':F' + to + ',' + names + ',K' + from + ':K' + to + ')';
  };
  var both = 'FLATTEN(B' + first + ':B' + last + ',F' + first + ':F' + last + ')';
  var col = function (letter) { return letter + first + ':' + letter + last; };

  return [
    { row: 2, col: MINUTES_FIRST_COL, values: [['Morning Min', 'Evening Min']] },
    { row: first, col: MINUTES_FIRST_COL, formulas: minuteRows },
    { row: 1, col: SUMMARY_FIRST_COL, values: [['All staff']] },
    {
      row: 1,
      col: SUMMARY_FIRST_COL + 1,
      formulas: [[
        '=SUM(J' + first + ':J' + half + ')+SUM(K' + first + ':K' + half + ')',
        '=SUM(J' + (half + 1) + ':J' + last + ')+SUM(K' + (half + 1) + ':K' + last + ')',
        '=N1+O1',
        '=INT(P1/60)&":"&TEXT(MOD(P1,60),"00")'
      ]]
    },
    { row: 2, col: SUMMARY_FIRST_COL, values: [['Employee', '1-15 min', '16-end min', 'Month min', 'Month h:mm']] },
    {
      row: first,
      col: SUMMARY_FIRST_COL,
      formulas: [[
        '=IFERROR(SORT(UNIQUE(FILTER(' + both + ',' + both + '<>""))),"")',
        '=ARRAYFORMULA(IF(' + names + '="","",' + sumIf(first, half) + '))',
        '=ARRAYFORMULA(IF(' + names + '="","",' + sumIf(half + 1, last) + '))',
        '=ARRAYFORMULA(IF(' + names + '="","",' + col('N') + '+' + col('O') + '))',
        '=ARRAYFORMULA(IF(' + names + '="","",INT(' + col('P') + '/60)&":"&TEXT(MOD(' + col('P') + ',60),"00")))'
      ]]
    }
  ];
}

/**
 * Adds the minute columns and totals to one month/Template tab using two reads and a few batch
 * writes. Returns 'added', 'present', or 'skipped: …' when a target cell holds something else (then
 * nothing at all is written).
 */
function ensureMonthFormulas(sheet) {
  var width = SUMMARY_LAST_COL - MINUTES_FIRST_COL + 1;
  var area = sheet.getRange(1, MINUTES_FIRST_COL, MONTH_LAST_ROW, width);
  var values = area.getValues();
  var formulas = area.getFormulas();
  var blocks = monthFormulaBlocks();
  var cellName = function (row, col) { return String.fromCharCode(64 + col) + row; };

  var conflict = null;
  var allPresent = true;
  blocks.forEach(function (block) {
    var data = block.formulas || block.values;
    data.forEach(function (line, i) {
      line.forEach(function (expected, j) {
        var r = block.row + i - 1;
        var c = block.col + j - MINUTES_FIRST_COL;
        var haveFormula = formulas[r][c];
        var haveValue = values[r][c];
        var same = block.formulas ? haveFormula === expected : !haveFormula && String(haveValue) === expected;
        var empty = !haveFormula && (haveValue === '' || haveValue === null);
        if (!same) allPresent = false;
        if (!same && !empty && !conflict) conflict = cellName(block.row + i, block.col + j);
      });
    });
  });
  if (allPresent) return 'present';
  if (conflict) return 'skipped: ' + conflict + ' already holds something else';

  // The totals' array formulas fill M4:Q33; those cells must be empty or the formulas can't expand.
  for (var r = MONTH_LAYOUT.FIRST_DAY_ROW; r < MONTH_LAST_ROW; r++) {
    for (var c = SUMMARY_FIRST_COL - MINUTES_FIRST_COL; c < width; c++) {
      if (formulas[r][c] || (values[r][c] !== '' && values[r][c] !== null)) {
        return 'skipped: ' + cellName(r + 1, c + MINUTES_FIRST_COL) + ' already holds something else';
      }
    }
  }

  blocks.forEach(function (block) {
    var data = block.formulas || block.values;
    var range = sheet.getRange(block.row, block.col, data.length, data[0].length);
    if (block.formulas) range.setFormulas(data);
    else range.setValues(data);
  });
  return 'added';
}

/**
 * Makes the Template's In/Out cells plain text so manual entries also stay exactly "HH:mm". Only when
 * they're all empty: applying "@" to an existing time value would display it as a raw number.
 */
function setTemplateTimeFormats(sheet) {
  var first = MONTH_LAYOUT.FIRST_DAY_ROW;
  var rows = MONTH_LAST_ROW - first + 1;
  var ranges = SHIFT_TYPES.map(function (shift) {
    return sheet.getRange(first, MONTH_LAYOUT.SHIFTS[shift].name + 1, rows, 2);
  });
  var hasValues = ranges.some(function (range) {
    return range.getValues().some(function (line) { return line.some(function (v) { return v !== '' && v !== null; }); });
  });
  if (hasValues) return false;
  ranges.forEach(function (range) { range.setNumberFormat('@'); });
  return true;
}

/**
 * Owner-run, once (Apps Script editor: choose migrateSheets, then Run). Adds the minute columns and
 * totals to the Template and every MM-YYYY tab, and makes the Template's empty In/Out cells plain text.
 * Additive only; re-running is harmless. The execution log lists what happened per tab.
 */
function migrateSheets() {
  return withScriptLock(function () {
    var report = [];
    spreadsheet().getSheets().forEach(function (sheet) {
      var name = sheet.getName();
      if (name !== SHEETS.TEMPLATE && !isValidMonthYear(name)) return;
      var result = ensureMonthFormulas(sheet);
      if (name === SHEETS.TEMPLATE && result.indexOf('skipped') !== 0) {
        result += setTemplateTimeFormats(sheet) ? ', In/Out set to plain text' : ', In/Out format left alone (cells not empty)';
      }
      report.push(name + ': ' + result);
    });
    if (!report.length) report.push('No Template or MM-YYYY tabs found.');
    audit('(setup)', 'setup.migrateSheets', 'month tabs', report.join('; '));
    Logger.log('migrateSheets:\n' + report.join('\n'));
    return report;
  });
}
