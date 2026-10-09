/**
 * WestSide Vapes - Google Apps Script backend (Code.gs)
 *
 * Paste into Google Sheets > Extensions > Apps Script and save. To update the live
 * app without changing its URL: Deploy > Manage deployments > edit (pencil) >
 * Version: New version > Deploy. (Execute as: Me, Who has access: Anyone.)
 *
 * Month tabs are named "MM-YYYY" and copied from the "Template" tab:
 *   Rows 1-2 headers, row 3 = day 1 ... row 33 = day 31
 *   A Date | B-E Morning: Name, In, Out, Hours | F-I Evening: Name, In, Out, Hours
 */

var FIRST_DAY_ROW = 3;
var SHIFT_COLUMNS = {
  Morning: { name: 2, hours: 5 }, // B name, C in, D out, E hours
  Evening: { name: 6, hours: 9 }  // F name, G in, H out, I hours
};
var DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getMonthSheet(ss, monthYear, createIfMissing) {
  // monthYear expected format: "MM-YYYY" (e.g., "08-2026")
  if (!/^(0[1-9]|1[0-2])-\d{4}$/.test(String(monthYear))) {
    throw new Error("Invalid monthYear '" + monthYear + "', expected MM-YYYY");
  }
  var sheet = ss.getSheetByName(monthYear);

  if (!sheet && createIfMissing) {
    // If the sheet for this month doesn't exist, duplicate the Template
    var template = ss.getSheetByName("Template");
    if (!template) {
      throw new Error("Template sheet not found! Please create a tab named 'Template'.");
    }
    sheet = template.copyTo(ss);
    sheet.setName(monthYear);

    var protection = sheet.protect().setDescription('Protected Monthly Sheet (' + monthYear + ')');
    protection.setWarningOnly(true);
  }
  return sheet;
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter) ? e.parameter.action : null;

    if (action === "getEmployees") {
      var sheet = ss.getSheetByName("Employees");
      if (!sheet) return responseJSON([]);
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return responseJSON([]);
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var employees = data.flat().filter(String);
      return responseJSON(employees);

    } else if (action === "getTimesheet") {
      var monthYear = e.parameter.monthYear; // e.g., "08-2026"
      if (!monthYear) return responseJSON({ status: "error", message: "Missing monthYear parameter" });
      // Read-only: browsing a month that has no tab yet must not create one.
      var sheet = getMonthSheet(ss, monthYear, false);
      if (!sheet) return responseJSON([]);
      // Display values return times exactly as the sheet shows them ("09:00"),
      // so neither the browser's nor the spreadsheet's time zone can shift them.
      return responseJSON(sheet.getDataRange().getDisplayValues());

    } else if (action === "getTimetable") {
      var sheet = ss.getSheetByName("Timetable");
      if (!sheet) return responseJSON([]);
      var data = sheet.getDataRange().getValues();
      return responseJSON(data);
    }
    return responseJSON({ status: "error", message: "Invalid or missing action parameter" });
  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // wait up to 10 seconds for concurrent requests
  } catch (lockErr) {
    return responseJSON({ status: "error", message: "Server busy, please try again in a moment." });
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    if (data.action === "updateTimetable") {
      return responseJSON(updateTimetable(ss, data.timetable));
    }
    return responseJSON(saveShift(ss, data));
  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Payload: { monthYear: "08-2026", date: 1-31, shift: "Morning"/"Evening", name: "John",
//            inTime: "09:00", outTime: "16:00", force: true/false }
// Empty name/inTime/outTime clears the slot (used for deletes).
function saveShift(ss, data) {
  var cols = SHIFT_COLUMNS[data.shift];
  if (!cols) throw new Error("Invalid shift '" + data.shift + "'");

  var sheet = getMonthSheet(ss, data.monthYear, true);
  var parts = data.monthYear.split("-"); // ["08", "2026"]
  var daysInMonth = new Date(Number(parts[1]), Number(parts[0]), 0).getDate();
  var day = Number(data.date);
  if (!(day >= 1 && day <= daysInMonth)) {
    throw new Error("Invalid date " + data.date + " for " + data.monthYear);
  }

  var name = String(data.name || "").trim();
  var inTime = normalizeTime(data.inTime);
  var outTime = normalizeTime(data.outTime);
  if (name && (!inTime || !outTime)) {
    throw new Error("In and Out times are required in HH:mm format");
  }

  // Row 3 corresponds to Date 1 (Row 1 & 2 are headers)
  var row = FIRST_DAY_ROW + day - 1;
  var slot = sheet.getRange(row, cols.name, 1, 3); // name, in, out
  var existing = slot.getDisplayValues()[0];
  var previous = {
    name: String(existing[0]).trim(),
    inTime: normalizeTime(existing[1]) || String(existing[1]).trim(),
    outTime: normalizeTime(existing[2]) || String(existing[2]).trim()
  };

  // Never silently replace a shift that's already in the sheet: the app shows
  // both versions and resends with force: true once the user confirms.
  var occupied = previous.name || previous.inTime || previous.outTime;
  var unchanged = previous.name === name && previous.inTime === inTime && previous.outTime === outTime;
  if (occupied && !unchanged && !data.force) {
    return { status: "conflict", previousData: previous };
  }

  var dayFormatted = (day < 10 ? "0" : "") + day;
  var fullDateStr = parts[0] + "/" + dayFormatted + "/" + parts[1]; // e.g., "08/15/2026"
  sheet.getRange(row, 1).setValue(fullDateStr);

  sheet.getRange(row, cols.name + 1, 1, 2).setNumberFormat("HH:mm");
  slot.setValues([[name, inTime, outTime]]);

  return { status: "success", previousData: previous };
}

// "9:00", "09:00:00", "4:00 PM" -> "09:00" / "16:00"; empty -> ""; unrecognised -> ""
function normalizeTime(value) {
  var str = String(value === null || value === undefined ? "" : value).trim();
  var m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(str);
  if (!m) return "";
  var h = Number(m[1]);
  var meridiem = m[3] ? m[3].toUpperCase() : "";
  if (meridiem === "PM" && h < 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) return "";
  return (h < 10 ? "0" : "") + h + ":" + m[2];
}

// timetable: [{ dayName: "Sunday", morning: [{ employeeName }], evening: [{ employeeName }] }, ...]
// Writes Morning to column B and Evening to column C of the row whose column A is the day.
function updateTimetable(ss, timetable) {
  if (!Array.isArray(timetable)) throw new Error("Missing timetable");

  var sheet = ss.getSheetByName("Timetable");
  if (!sheet) {
    sheet = ss.insertSheet("Timetable");
    sheet.appendRow(["Day", "Morning", "Evening"]);
  }
  var lastRow = sheet.getLastRow();
  var rowDays = lastRow > 0
    ? sheet.getRange(1, 1, lastRow, 1).getDisplayValues().map(function (r) { return String(r[0]).trim().toLowerCase(); })
    : [];

  timetable.forEach(function (day) {
    var dayName = String((day && day.dayName) || "").trim();
    if (DAY_NAMES.indexOf(dayName.toLowerCase()) === -1) return;
    var morning = firstEmployee(day.morning);
    var evening = firstEmployee(day.evening);

    var index = rowDays.indexOf(dayName.toLowerCase());
    if (index === -1) {
      sheet.appendRow([dayName, morning, evening]);
      rowDays.push(dayName.toLowerCase());
    } else {
      sheet.getRange(index + 1, 2, 1, 2).setValues([[morning, evening]]);
    }
  });
  return { status: "success" };
}

function firstEmployee(shifts) {
  return Array.isArray(shifts) && shifts[0] ? String(shifts[0].employeeName || "").trim() : "";
}

// Placed at the bottom of the script
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function addEmployee(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Employees");
  if (!sheet) {
    sheet = ss.insertSheet("Employees");
    sheet.appendRow(["Employee Name"]);
  }
  sheet.appendRow([name]);
}
