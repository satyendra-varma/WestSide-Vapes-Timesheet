import { DEFAULT_APPS_SCRIPT_URL, INITIAL_EMPLOYEES, calculateShiftHours, getTodayDateString } from '../config';
import { ShiftRecord, DaySchedule } from '../types';

const STORAGE_KEY_URL = 'westside_vapes_script_url';
const STORAGE_KEY_TIMESHEETS = 'westside_vapes_timesheets_data';
const STORAGE_KEY_TIMETABLE = 'westside_vapes_timetable_data';
const STORAGE_KEY_EMPLOYEES = 'westside_vapes_employees_data';

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

// Helper: Format raw sheet time values into "HH:mm" strings
function formatTimeString(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';
    // Handle ISO date strings e.g. "1899-12-30T09:00:00.000Z" or "2026-08-01T09:00:00.000Z"
    if (trimmed.includes('T')) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins}`;
      }
    }
    // Handle HH:mm or HH:mm:ss
    const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const h = String(parseInt(match[1], 10)).padStart(2, '0');
      const m = match[2];
      return `${h}:${m}`;
    }
  }
  if (val instanceof Date) {
    const hours = String(val.getHours()).padStart(2, '0');
    const mins = String(val.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  }
  return String(val);
}

// Helper: Local storage cache
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

// 1. Fetch Employees list from Google Sheets (Employees tab)
export async function fetchEmployees(): Promise<{ employees: string[]; isMock: boolean }> {
  const scriptUrl = getSavedScriptUrl();
  if (isSampleUrl(scriptUrl)) {
    return { employees: INITIAL_EMPLOYEES, isMock: true };
  }

  try {
    const response = await fetch(`${scriptUrl}?action=getEmployees`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      const cleaned = data.map(e => String(e).trim()).filter(Boolean);
      return { employees: cleaned.length > 0 ? cleaned : INITIAL_EMPLOYEES, isMock: false };
    } else if (data.employees && Array.isArray(data.employees)) {
      const cleaned = data.employees.map((e: any) => String(e).trim()).filter(Boolean);
      return { employees: cleaned.length > 0 ? cleaned : INITIAL_EMPLOYEES, isMock: false };
    }
    return { employees: INITIAL_EMPLOYEES, isMock: false };
  } catch (err) {
    console.warn('Google Apps Script employee fetch failed, using default list:', err);
    return { employees: INITIAL_EMPLOYEES, isMock: false };
  }
}

// 2. Fetch Timesheet for specific Month & Year from Google Sheets (e.g. tab "08-2026")
export async function fetchTimesheet(month: number, year: number): Promise<{ records: ShiftRecord[]; isMock: boolean }> {
  const scriptUrl = getSavedScriptUrl();
  const monthPadded = String(month).padStart(2, '0');
  const monthYear = `${monthPadded}-${year}`; // e.g., "08-2026"

  if (isSampleUrl(scriptUrl)) {
    const all = getCachedTimesheets();
    const filtered = all.filter(r => {
      const d = new Date(r.date + 'T00:00:00');
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    return { records: filtered, isMock: true };
  }

  try {
    const response = await fetch(`${scriptUrl}?action=getTimesheet&monthYear=${encodeURIComponent(monthYear)}`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const records: ShiftRecord[] = [];

    // Backend returns 2D array of spreadsheet values
    if (Array.isArray(data)) {
      // Row 0 & 1 are headers. Row 2 corresponds to Date 1 (Row 3 in Google Sheet)
      for (let r = 2; r < data.length; r++) {
        const row = data[r];
        if (!Array.isArray(row)) continue;

        // Day number is r - 1 (or value in column 0)
        const parsedDay = parseInt(row[0], 10);
        const dayNum = !isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : (r - 1);
        const dayPadded = String(dayNum).padStart(2, '0');
        const dateStr = `${year}-${monthPadded}-${dayPadded}`; // "YYYY-MM-DD"

        // Morning Shift: Col B (1), Col C (2), Col D (3)
        const morningName = row[1] ? String(row[1]).trim() : '';
        if (morningName && morningName.toLowerCase() !== 'name' && morningName.toLowerCase() !== 'employee name') {
          const inTime = formatTimeString(row[2]) || '09:00';
          const outTime = formatTimeString(row[3]) || '15:30';
          records.push({
            id: `shift_${dateStr}_Morning`,
            employeeName: morningName,
            date: dateStr,
            shift: 'Morning',
            inTime,
            outTime,
            totalHours: calculateShiftHours(inTime, outTime),
            submittedAt: dateStr,
          });
        }

        // Evening Shift: Col F (5), Col G (6), Col H (7)
        const eveningName = row[5] ? String(row[5]).trim() : '';
        if (eveningName && eveningName.toLowerCase() !== 'name' && eveningName.toLowerCase() !== 'employee name') {
          const inTime = formatTimeString(row[6]) || '15:30';
          const outTime = formatTimeString(row[7]) || '22:00';
          records.push({
            id: `shift_${dateStr}_Evening`,
            employeeName: eveningName,
            date: dateStr,
            shift: 'Evening',
            inTime,
            outTime,
            totalHours: calculateShiftHours(inTime, outTime),
            submittedAt: dateStr,
          });
        }
      }
    }

    saveCachedTimesheets(records);
    return { records, isMock: false };
  } catch (err) {
    console.warn('Google Apps Script timesheet fetch failed, using cached dataset:', err);
    const all = getCachedTimesheets();
    const filtered = all.filter(r => {
      const d = new Date(r.date + 'T00:00:00');
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    return { records: filtered, isMock: true };
  }
}

// 3. Fetch Timetable Schedule from Google Sheets (Timetable tab)
export async function fetchTimetable(): Promise<{ timetable: DaySchedule[]; isMock: boolean }> {
  const scriptUrl = getSavedScriptUrl();
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (isSampleUrl(scriptUrl)) {
    const timetable = daysOfWeek.map((dayName) => ({
      dayName,
      dateStr: '',
      morning: [{ employeeName: '' }],
      evening: [{ employeeName: '' }],
    }));
    return { timetable, isMock: true };
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

    return { timetable, isMock: false };
  } catch (err) {
    console.warn('Google Apps Script timetable fetch failed:', err);
    const timetable = daysOfWeek.map((dayName) => ({
      dayName,
      dateStr: '',
      morning: [{ employeeName: '' }],
      evening: [{ employeeName: '' }],
    }));
    return { timetable, isMock: true };
  }
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
  const totalHours = calculateShiftHours(payload.inTime, payload.outTime);

  // Parse YYYY-MM-DD into monthYear e.g. "08-2026" and date number e.g. 1
  const parts = payload.date.split('-');
  const year = parts[0];
  const monthStr = parts[1];
  const dayNum = parseInt(parts[2], 10);
  const monthYear = `${monthStr}-${year}`;

  // Check for conflicts in local cache if forceOverwrite is false
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
  // { monthYear: "08-2026", date: 1, shift: "Morning", name: "John", inTime: "08:00", outTime: "16:00" }
  const postBody = {
    monthYear,
    date: dayNum,
    shift: payload.shift,
    name: payload.employeeName,
    inTime: payload.inTime,
    outTime: payload.outTime,
  };

  const newRecord: ShiftRecord = {
    id: `shift_${payload.date}_${payload.shift}`,
    employeeName: payload.employeeName,
    date: payload.date,
    shift: payload.shift,
    inTime: payload.inTime,
    outTime: payload.outTime,
    totalHours,
    submittedAt: new Date().toISOString(),
  };

  if (isSampleUrl(scriptUrl)) {
    const cached = getCachedTimesheets();
    const idx = cached.findIndex(r => r.date === payload.date && r.shift === payload.shift);
    if (idx !== -1) {
      cached[idx] = newRecord;
    } else {
      cached.unshift(newRecord);
    }
    saveCachedTimesheets(cached);

    return {
      success: true,
      hasConflict: false,
      message: 'Shift log saved successfully!',
      record: newRecord,
      isMock: true,
    };
  }

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(postBody),
    });

    const result = await response.json();

    // Update local cache
    const cached = getCachedTimesheets();
    const idx = cached.findIndex(r => r.date === payload.date && r.shift === payload.shift);
    if (idx !== -1) {
      cached[idx] = newRecord;
    } else {
      cached.unshift(newRecord);
    }
    saveCachedTimesheets(cached);

    return {
      success: true,
      hasConflict: false,
      message: 'Shift log successfully saved to Google Sheets!',
      record: newRecord,
      isMock: false,
    };
  } catch (err: any) {
    console.error('Error posting shift to Google Apps Script:', err);
    // Fallback cache save
    const cached = getCachedTimesheets();
    cached.unshift(newRecord);
    saveCachedTimesheets(cached);

    return {
      success: true,
      hasConflict: false,
      message: 'Shift saved locally (network issue).',
      record: newRecord,
      isMock: true,
    };
  }
}

// 5. Update Shift Entry
export async function updateShiftApi(record: ShiftRecord): Promise<{ success: boolean; isMock: boolean }> {
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
export async function deleteShiftApi(id: string, record?: ShiftRecord): Promise<{ success: boolean; isMock: boolean }> {
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
    return { success: false, isMock: false };
  }

  const parts = targetDate.split('-');
  const year = parts[0];
  const monthStr = parts[1];
  const dayNum = parseInt(parts[2], 10);
  const monthYear = `${monthStr}-${year}`;

  // Post empty values to clear cells in Google Sheets
  const postBody = {
    monthYear,
    date: dayNum,
    shift: targetShift,
    name: '',
    inTime: '',
    outTime: '',
  };

  // Remove from cache
  const cached = getCachedTimesheets().filter(r => r.id !== id && !(r.date === targetDate && r.shift === targetShift));
  saveCachedTimesheets(cached);

  if (isSampleUrl(scriptUrl)) {
    return { success: true, isMock: true };
  }

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(postBody),
    });
    return { success: true, isMock: false };
  } catch (err) {
    console.error('Failed to clear shift in Apps Script:', err);
    return { success: true, isMock: true };
  }
}

export async function updateTimetableLocal(timetable: DaySchedule[]): Promise<void> {
  const scriptUrl = getSavedScriptUrl();
  if (!isSampleUrl(scriptUrl)) {
    try {
      await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'updateTimetable', timetable }),
      });
    } catch (e) {
      console.warn('Failed to sync timetable to Apps Script:', e);
    }
  }
}
