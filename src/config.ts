// Designated variable for deployed Google Apps Script Web App URL
// Update this URL with your deployed Google Apps Script Web App URL
export const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrhLwUIrHBSnHqrv1MZT8Fi51qgiiRdxxw-Y5s5gXB5kTvkGZ9zq7VPoJHemH9w4Gk5w/exec";

export const SHOP_INFO = {
  name: "WestSide Vapes",
  tagline: "Kerrisdale Location Timesheet",
  morningShift: {
    label: "Morning Shift",
    defaultIn: "09:00",
    defaultOut: "16:00",
  },
  eveningShift: {
    label: "Evening Shift",
    defaultIn: "16:00",
    defaultOut: "23:00",
  },
};

// Fallback staff list before the Employees tab has loaded. Empty on purpose:
// real names must never ship in the bundle; the list always comes from the sheet.
export const INITIAL_EMPLOYEES: string[] = [];

// Get current date string in YYYY-MM-DD
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
