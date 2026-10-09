import { DEFAULT_APPS_SCRIPT_URL, INITIAL_EMPLOYEES } from '../config';
import { ShiftRecord, DaySchedule } from '../types';

const STORAGE_KEY_URL = 'westside_vapes_script_url';
const STORAGE_KEY_TIMESHEETS = 'westside_vapes_timesheets_data';
const STORAGE_KEY_TIMETABLE = 'westside_vapes_timetable_data';
const STORAGE_KEY_EMPLOYEES = 'westside_vapes_employees_data';

const NOT_SAVED_MESSAGE = "Couldn't reach Google Sheets. The shift was NOT saved. Check the connection and try again.";

// Retrieve saved Apps Script URL or default live deployment URL
export function getSavedScriptUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY_URL);
  if (!saved || saved.includes('SAMPLE_WESTSIDE_VAPES')) {
    return DEFAULT_APPS_SCRIPT_URL;
  }
  return saved;
}

export function saveScriptUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
}

function isSampleUrl(url: string): boolean {
  return !url || url.includes('SAMPLE_WESTSIDE_VAPES') || url.includes('your-apps-script-url');
}

// Helper: Normalise a time cell from the sheet into "HH:mm". The backend sends
// display strings ("9:00", "09:00:00", "4:00 PM"); older deployments sent ISO dates.
// Unrecognised values are returned as-is so they show up for review instead of
// being replaced with made-up hours.
function formatTimeString(val: any): string {
  if (val === null || val === undefined) return '';
  const trimmed = String(val).trim();
  if (!trimmed) return '';

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(trimmed);
  if (match) {
    let hours = parseInt(match[1], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${match[2]}`;
  }

  // Handle ISO date strings e.g. "1899-12-30T17:00:00.000Z"
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${mins}`;
    }
  }
  return trimmed;
}

// Helper: Local storage caches for employees, timetable, and timesheets
export function getCachedEmployees(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_EMPLOYEES);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to get cached employees:', e);
  }
  return INITIAL_EMPLOYEES;
}

export function saveCachedEmployees(employees: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(employees));
  } catch (e) {
    console.warn('Failed to save cached employees:', e);
  }
}

export function getCachedTimetable(): DaySchedule[] {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  try {
    const data = localStorage.getItem(STORAGE_KEY_TIMETABLE);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length === 7) return parsed;
    }
  } catch (e) {
    console.warn('Failed to get cached timetable:', e);
  }
  return daysOfWeek.map((dayName) => ({
    dayName,
    dateStr: '',
    morning: [{ employeeName: '' }],
    evening: [{ employeeName: '' }],
  }));
}

export function saveCachedTimetable(timetable: DaySchedule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TIMETABLE, JSON.stringify(timetable));
  } catch (e) {
    console.warn('Failed to save cached timetable:', e);
  }
}

function getCachedTimesheets(): ShiftRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_TIMESHEETS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveCachedTimesheets(records: ShiftRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TIMESHEETS, JSON.stringify(records));
  } catch (e) {
    console.warn('Failed to save cached timesheets:', e);
  }
}

function upsertCachedRecord(record: ShiftRecord): void {
  const cached = getCachedTimesheets().filter((r) => !(r.date === record.date && r.shift === record.shift));
  cached.unshift(record);
  saveCachedTimesheets(cached);
}

export function getCachedTimesheet(month: number, year: number): ShiftRecord[] {
  const all = getCachedTimesheets();
  const monthPadded = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${monthPadded}`;
  return all.filter((r) => r.date && r.date.startsWith(monthPrefix));
}

// 1. Fetch Employees list from Google Sheets (Employees tab)
export async function fetchEmployees(): Promise<{ employees: string[]; isMock: boolean }> {
  const scriptUrl = getSavedScriptUrl();
  if (isSampleUrl(scriptUrl)) {
    return { employees: getCachedEmployees(), isMock: true };
  }

  try {
    const response = await fetch(`${scriptUrl}?action=getEmployees`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    let cleaned: string[] = [];
    if (Array.isArray(data)) {
      cleaned = data.map(e => String(e).trim()).filter(Boolean);
    } else if (data.employees && Array.isArray(data.employees)) {
      cleaned = data.employees.map((e: any) => String(e).trim()).filter(Boolean);
    }

    if (cleaned.length > 0) {
      saveCachedEmployees(cleaned);
      return { employees: cleaned, isMock: false };
    }
    return { employees: getCachedEmployees(), isMock: false };
  } catch (err) {
    console.warn('Google Apps Script employee fetch failed, using default list:', err);
    return { employees: getCachedEmployees(), isMock: false };
  }
}

// 2. Fetch Timesheet for specific Month & Year from Google Sheets (e.g. tab "08-2026")
// `failed` means the sheet couldn't be read and the records are the last saved copy.
export async function fetchTimesheet(month: number, year: number): Promise<{ records: ShiftRecord[]; isMock: boolean; failed?: boolean }> {
  const scriptUrl = getSavedScriptUrl();
  const monthPadded = String(month).padStart(2, '0');
  const monthYear = `${monthPadded}-${year}`; // e.g., "08-2026"
  const monthPrefix = `${year}-${monthPadded}`;

  if (isSampleUrl(scriptUrl)) {
    const filtered = getCachedTimesheet(month, year);
    return { records: filtered, isMock: true };
  }

  try {
    const response = await fetch(`${scriptUrl}?action=getTimesheet&monthYear=${encodeURIComponent(monthYear)}`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(data?.message || 'Unexpected response from Apps Script');
    }

    const records: ShiftRecord[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    const addShift = (dateStr: string, shift: 'Morning' | 'Evening', name: any, inVal: any, outVal: any) => {
      const employeeName = name ? String(name).trim() : '';
      if (!employeeName) return;
      // Missing times stay empty (0 minutes, flagged for review) rather than
      // defaulting to a full shift that may never have been worked.
      records.push({
        id: `shift_${dateStr}_${shift}`,
        employeeName,
        date: dateStr,
        shift,
        inTime: formatTimeString(inVal),
        outTime: formatTimeString(outVal),
        submittedAt: dateStr,
      });
    };

    // Rows 0 & 1 are headers; row index day + 1 holds that day (sheet row day + 2),
    // the same position doPost writes to. Column A isn't trusted for the day number
    // because the sheet may store it as a date, a string, or nothing.
    for (let day = 1; day <= daysInMonth; day++) {
      const row = data[day + 1];
      if (!Array.isArray(row)) continue;
      const dateStr = `${year}-${monthPadded}-${String(day).padStart(2, '0')}`; // "YYYY-MM-DD"

      // Morning Shift: Col B (1), Col C (2), Col D (3)
      addShift(dateStr, 'Morning', row[1], row[2], row[3]);
      // Evening Shift: Col F (5), Col G (6), Col H (7)
      addShift(dateStr, 'Evening', row[5], row[6], row[7]);
    }

    const allCached = getCachedTimesheets();
    const remainingCached = allCached.filter(r => !r.date.startsWith(monthPrefix));
    saveCachedTimesheets([...records, ...remainingCached]);
    return { records, isMock: false };
  } catch (err) {
    console.warn('Google Apps Script timesheet fetch failed, using cached dataset:', err);
    const filtered = getCachedTimesheet(month, year);
    return { records: filtered, isMock: true, failed: true };
  }
}

// 3. Fetch Timetable Schedule from Google Sheets (Timetable tab)
export async function fetchTimetable(): Promise<{ timetable: DaySchedule[]; isMock: boolean }> {
  const scriptUrl = getSavedScriptUrl();
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (isSampleUrl(scriptUrl)) {
    return { timetable: getCachedTimetable(), isMock: true };
  }

  try {
    const response = await fetch(`${scriptUrl}?action=getTimetable`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const timetable: DaySchedule[] = daysOfWeek.map((dayName) => {
      let morningEmp = '';
      let eveningEmp = '';

      if (Array.isArray(data)) {
        const foundRow = data.find(row => Array.isArray(row) && String(row[0]).trim().toLowerCase() === dayName.toLowerCase());
        if (foundRow) {
          const mVal = foundRow[1] ? String(foundRow[1]).trim() : '';
          const eVal = foundRow[2] ? String(foundRow[2]).trim() : '';

          if (mVal && !['morning', 'morning shift', 'employee', 'name'].includes(mVal.toLowerCase())) {
            morningEmp = mVal;
          }
          if (eVal && !['evening', 'evening shift', 'employee', 'name'].includes(eVal.toLowerCase())) {
            eveningEmp = eVal;
          }
        }
      }

      return {
        dayName,
        dateStr: '',
        morning: [{ employeeName: morningEmp }],
        evening: [{ employeeName: eveningEmp }],
      };
    });

    saveCachedTimetable(timetable);
    return { timetable, isMock: false };
  } catch (err) {
    console.warn('Google Apps Script timetable fetch failed:', err);
    return { timetable: getCachedTimetable(), isMock: true };
  }
}

// POST to Apps Script doPost(e). Throws on network failure or a non-JSON reply.
async function postToScript(scriptUrl: string, body: object): Promise<any> {
  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function splitDate(date: string): { monthYear: string; dayNum: number } {
  // "YYYY-MM-DD" -> monthYear "MM-YYYY" e.g. "08-2026", day number e.g. 1
  const [year, monthStr, day] = date.split('-');
  return { monthYear: `${monthStr}-${year}`, dayNum: parseInt(day, 10) };
}

// 4. Submit Shift Log directly to Google Apps Script doPost(e)
export async function submitShiftApi(payload: {
  employeeName: string;
  date: string; // "YYYY-MM-DD"
  shift: 'Morning' | 'Evening';
  inTime: string;
  outTime: string;
  forceOverwrite?: boolean;
}): Promise<{
  success: boolean;
  hasConflict?: boolean;
  previousRecord?: ShiftRecord;
  message?: string;
  record?: ShiftRecord;
  isMock: boolean;
}> {
  const scriptUrl = getSavedScriptUrl();
  const { monthYear, dayNum } = splitDate(payload.date);

  // Quick conflict check against the local cache. The backend repeats this check
  // against the live sheet, so a stale cache can't silently overwrite a shift.
  if (!payload.forceOverwrite) {
    const cached = getCachedTimesheets();
    const existing = cached.find(r => r.date === payload.date && r.shift === payload.shift);
    if (existing) {
      const isIdentical =
        existing.employeeName === payload.employeeName &&
        existing.inTime === payload.inTime &&
        existing.outTime === payload.outTime;

      if (!isIdentical) {
        return {
          success: false,
          hasConflict: true,
          previousRecord: existing,
          message: `A shift is already logged for ${payload.date} (${payload.shift} Shift).`,
          isMock: isSampleUrl(scriptUrl),
        };
      }
    }
  }

  // Construct payload matching Google Apps Script doPost expectation:
  // { monthYear: "08-2026", date: 1, shift: "Morning", name: "John", inTime: "08:00", outTime: "16:00", force: false }
  const postBody = {
    monthYear,
    date: dayNum,
    shift: payload.shift,
    name: payload.employeeName,
    inTime: payload.inTime,
    outTime: payload.outTime,
    force: !!payload.forceOverwrite,
  };

  const newRecord: ShiftRecord = {
    id: `shift_${payload.date}_${payload.shift}`,
    employeeName: payload.employeeName,
    date: payload.date,
    shift: payload.shift,
    inTime: payload.inTime,
    outTime: payload.outTime,
    submittedAt: new Date().toISOString(),
  };

  if (isSampleUrl(scriptUrl)) {
    upsertCachedRecord(newRecord);
    return {
      success: true,
      hasConflict: false,
      message: 'Shift log saved successfully!',
      record: newRecord,
      isMock: true,
    };
  }

  try {
    const result = await postToScript(scriptUrl, postBody);

    if (result?.status === 'conflict') {
      const prev = result.previousData || {};
      return {
        success: false,
        hasConflict: true,
        previousRecord: {
          id: newRecord.id,
          employeeName: String(prev.name || ''),
          date: payload.date,
          shift: payload.shift,
          inTime: formatTimeString(prev.inTime),
          outTime: formatTimeString(prev.outTime),
          submittedAt: '',
        },
        message: `A shift is already logged for ${payload.date} (${payload.shift} Shift).`,
        isMock: false,
      };
    }

    if (result?.status !== 'success') {
      return {
        success: false,
        message: `Not saved: ${result?.message || 'Google Sheets rejected the update.'}`,
        isMock: false,
      };
    }

    upsertCachedRecord(newRecord);
    return {
      success: true,
      hasConflict: false,
      message: 'Shift log successfully saved to Google Sheets!',
      record: newRecord,
      isMock: false,
    };
  } catch (err: any) {
    console.error('Error posting shift to Google Apps Script:', err);
    // Don't pretend it was saved: a locally cached shift is wiped on the next
    // sheet refresh and would never be paid.
    return { success: false, message: NOT_SAVED_MESSAGE, isMock: false };
  }
}

// 5. Update Shift Entry
export async function updateShiftApi(record: ShiftRecord): Promise<{ success: boolean; message?: string; isMock: boolean }> {
  return submitShiftApi({
    employeeName: record.employeeName,
    date: record.date,
    shift: record.shift,
    inTime: record.inTime,
    outTime: record.outTime,
    forceOverwrite: true,
  });
}

// 6. Delete Shift Entry by clearing values in Google Sheets
export async function deleteShiftApi(id: string, record?: ShiftRecord): Promise<{ success: boolean; message?: string; isMock: boolean }> {
  const scriptUrl = getSavedScriptUrl();

  let targetDate = record?.date;
  let targetShift = record?.shift;

  if (!targetDate || !targetShift) {
    // Attempt parsing ID e.g. "shift_2026-08-01_Morning"
    const cleanId = id.replace('shift_', '');
    const lastUnderscore = cleanId.lastIndexOf('_');
    if (lastUnderscore !== -1) {
      targetDate = cleanId.substring(0, lastUnderscore);
      targetShift = cleanId.substring(lastUnderscore + 1) as 'Morning' | 'Evening';
    }
  }

  if (!targetDate || !targetShift) {
    return { success: false, message: 'Could not identify the shift to delete.', isMock: false };
  }

  const { monthYear, dayNum } = splitDate(targetDate);

  // Post empty values to clear cells in Google Sheets
  const postBody = {
    monthYear,
    date: dayNum,
    shift: targetShift,
    name: '',
    inTime: '',
    outTime: '',
    force: true,
  };

  const removeFromCache = () => {
    const cached = getCachedTimesheets().filter(r => r.id !== id && !(r.date === targetDate && r.shift === targetShift));
    saveCachedTimesheets(cached);
  };

  if (isSampleUrl(scriptUrl)) {
    removeFromCache();
    return { success: true, isMock: true };
  }

  try {
    const result = await postToScript(scriptUrl, postBody);
    if (result?.status !== 'success') {
      return { success: false, message: `Not deleted: ${result?.message || 'Google Sheets rejected the update.'}`, isMock: false };
    }
    removeFromCache();
    return { success: true, isMock: false };
  } catch (err) {
    console.error('Failed to clear shift in Apps Script:', err);
    return { success: false, message: "Couldn't reach Google Sheets. The shift was NOT deleted.", isMock: false };
  }
}

export async function updateTimetableLocal(timetable: DaySchedule[]): Promise<{ success: boolean; message?: string }> {
  const scriptUrl = getSavedScriptUrl();
  if (isSampleUrl(scriptUrl)) {
    saveCachedTimetable(timetable);
    return { success: true };
  }

  try {
    const result = await postToScript(scriptUrl, { action: 'updateTimetable', timetable });
    if (result?.status !== 'success') {
      return { success: false, message: `Roster not saved: ${result?.message || 'Google Sheets rejected the update.'}` };
    }
    saveCachedTimetable(timetable);
    return { success: true };
  } catch (e) {
    console.warn('Failed to sync timetable to Apps Script:', e);
    return { success: false, message: "Couldn't reach Google Sheets. The roster was NOT saved." };
  }
}
