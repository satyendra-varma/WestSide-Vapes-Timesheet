export const APPS_SCRIPT_CODE_GS = `/**
 * WestSide Vapes - Google Apps Script Backend (Code.gs)
 * Paste this into Google Sheets > Extensions > Apps Script
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

function getActiveSheetForDate(ss, dateStr) {
  // dateStr expected format: "MM-YYYY" (e.g., "08-2026")
  var sheetName = dateStr;
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    // If the sheet for this month doesn't exist, duplicate the Template
    var template = ss.getSheetByName("Template");
    if (!template) {
      throw new Error("Template sheet not found! Please create a tab named 'Template'.");
    }
    sheet = template.copyTo(ss);
    sheet.setName(sheetName);
  }
  return sheet;
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = e.parameter.action;
  
  if (action === "getEmployees") {
    var sheet = ss.getSheetByName("Employees");
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    var employees = data.flat().filter(String);
    return ContentService.createTextOutput(JSON.stringify(employees))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } else if (action === "getTimesheet") {
    var monthYear = e.parameter.monthYear; // e.g., "08-2026"
    var sheet = getActiveSheetForDate(ss, monthYear);
    var data = sheet.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify(data))
                         .setMimeType(ContentService.MimeType.JSON);
  } else if (action === "getTimetable") {
    var sheet = ss.getSheetByName("Timetable");
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify(data))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);
  
  // Expected payload: { monthYear: "08-2026", date: 1-31, shift: "Morning"/"Evening", name: "John", inTime: "08:00", outTime: "16:00" }
  var sheet = getActiveSheetForDate(ss, data.monthYear);
  
  // Row 3 corresponds to Date 1 (Row 1 & 2 are headers)
  var dateRowMap = Number(data.date) + 2; 
  
  var nameCol = (data.shift === "Morning") ? 2 : 6;   // Col B or F
  var inCol   = (data.shift === "Morning") ? 3 : 7;   // Col C or G
  var outCol  = (data.shift === "Morning") ? 4 : 8;   // Col D or H
  
  // Check existing data for conflict handling on frontend/backend check
  var existingName = sheet.getRange(dateRowMap, nameCol).getValue();
  var existingIn = sheet.getRange(dateRowMap, inCol).getValue();
  var existingOut = sheet.getRange(dateRowMap, outCol).getValue();
  
  // Write new data
  sheet.getRange(dateRowMap, nameCol).setValue(data.name);
  sheet.getRange(dateRowMap, inCol).setValue(data.inTime);
  sheet.getRange(dateRowMap, outCol).setValue(data.outTime);
  
  return ContentService.createTextOutput(JSON.stringify({
    "status": "success",
    "previousData": {
      "name": existingName,
      "inTime": existingIn,
      "outTime": existingOut
    }
  })).setMimeType(ContentService.MimeType.JSON);
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
`;
