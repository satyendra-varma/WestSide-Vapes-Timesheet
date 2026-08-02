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

export const INITIAL_EMPLOYEES = [
  "Alex Rivera",
  "Jordan Lee",
  "Sam Taylor",
  "Casey Morgan",
  "Taylor Swift",
  "Marcus Vance",
  "Devon Rex"
];

// Get current date string in YYYY-MM-DD
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate hours between HH:mm strings
export function calculateShiftHours(inTime: string, outTime: string): number {
  if (!inTime || !outTime) return 0;
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);

  let inMinutes = inH * 60 + inM;
  let outMinutes = outH * 60 + outM;

  // Handles overnight shifts if outTime is earlier than inTime
  if (outMinutes < inMinutes) {
    outMinutes += 24 * 60;
  }

  const diffMinutes = outMinutes - inMinutes;
  return Math.round((diffMinutes / 60) * 10) / 10;
}
