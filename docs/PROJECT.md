# Project reference

Describes the code on `dev`; it's updated as phases merge. `main` is the live site and lags behind
until the owner merges. See `PROGRESS.md` for status.

## What it is
A mobile-first web app for staff at WestSide Vapes, Kerrisdale:
- **Log Shift:** an employee records date, Morning/Evening shift, in and out time.
- **Timesheet:** month view with pay periods (full month, 1–15, 16–end), hours per employee, edit/delete.
- **Timetable:** weekly roster (one person per Morning/Evening slot, Sunday–Saturday).

There is no server or database of our own. The Google Sheet is the system of record; the browser keeps a
localStorage cache.

## Architecture

```
 Browser (React SPA on GitHub Pages)
   │  localStorage cache: employees, timetable, timesheet records, script URL
   │
   │  GET  ?action=…                      (JSON response)
   │  POST body=JSON, Content-Type text/plain (no CORS preflight)
   ▼
 Google Apps Script web app  (apps-script/Code.gs, "Execute as: Me", "Anyone")
   │  doGet  → read tabs
   │  doPost → write shift / clear shift / write roster   (script lock, 10 s)
   ▼
 Google Sheet: Template · MM-YYYY month tabs · Employees · Timetable
```

- Stack: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), lucide-react icons.
- Hosting: `.github/workflows/deploy.yml` runs on every push to `main`: `npm install`, `npm run build`,
  publish `dist/` to GitHub Pages. Vite `base` is `/WestSide-Vapes-Timesheet/`.
- Unused dependencies left over from the AI Studio template: `@google/genai`, `express`, `dotenv`,
  `motion`, `@types/express` (removal planned in Phase 3).

## File map

| Path | Purpose |
|---|---|
| `apps-script/Code.gs` | Backend. Pasted into the Sheet's Apps Script editor by hand. Also bundled into the app (`?raw` import) for Settings → Copy Backend Script. |
| `src/main.tsx` | React entry. |
| `src/App.tsx` | Shell: header, tab state, settings modal. On load, fetches employees, timetable and the current month in parallel, then fires the `westside_vapes_data_refreshed` window event. |
| `src/config.ts` | `DEFAULT_APPS_SCRIPT_URL` (live deployment, public), `SHOP_INFO` (name, default shift times 09:00–16:00 / 16:00–23:00), `INITIAL_EMPLOYEES` fallback list, `getTodayDateString`. |
| `src/types.ts` | `ShiftRecord`, `DaySchedule` (+ unused `ConflictCheckPayload`, `AppsScriptResponse`). |
| `src/services/api.ts` | Every backend call, response handling, sheet-row parsing, localStorage caches. |
| `src/utils/hours.ts` | **Only** place hours are computed: integer minutes, formatting, per-employee totals, review flag. Tests: `hours.test.ts`. |
| `src/utils/periods.ts` | Semi-monthly pay periods (1–15, 16–end). Tests: `periods.test.ts`. |
| `src/utils/appsScriptTemplate.ts` | `?raw` re-export of `apps-script/Code.gs` for Settings → Copy; drift test in `appsScriptTemplate.test.ts`. |
| `vitest.config.ts` | Test runner config (`npm test`). |
| `src/utils/githubPagesExport.ts` | Legacy single-file HTML generator (Settings → Download). Out of date; see Known gaps. |
| `src/vite-env.d.ts` | Vite client types (needed for the `?raw` import). |
| `src/components/Header.tsx` | Brand, Live/Demo pill, settings button. |
| `src/components/BottomNav.tsx` | Tabs: Log Shift / Timesheet / Timetable. |
| `src/components/ShiftLoggingTab.tsx` | Shift form, validation, conflict flow. |
| `src/components/ConflictModal.tsx` | Existing vs new shift, side by side; Overwrite / Cancel. |
| `src/components/MonthlyTimesheetTab.tsx` | Month picker, pay periods, stats, Hours by Employee + Copy, shift list, edit modal, delete. |
| `src/components/TimetableTab.tsx` | Weekly roster view and per-day edit. |
| `src/components/SettingsModal.tsx` | Script URL (saved in localStorage), Test URL, Copy Code.gs, legacy HTML download. |
| `.github/workflows/deploy.yml` | Build + deploy to GitHub Pages on push to `main`. |
| `.claude/launch.json` | Local dev-server config for Claude's preview browser (untracked). |

## Data model (frontend)

```ts
ShiftRecord { id: "shift_YYYY-MM-DD_Morning|Evening", employeeName, date: "YYYY-MM-DD",
              shift: "Morning"|"Evening", inTime: "HH:mm", outTime: "HH:mm", submittedAt, notes? }
DaySchedule { dayName: "Sunday"…, dateStr: "", morning: [{employeeName}], evening: [{employeeName}] }
```
- No stored hours. Minutes always come from `shiftMinutes(inTime, outTime)`: an out time earlier than
  the in time counts as past midnight; missing, invalid or equal times give 0 minutes and the shift is
  flagged for review.
- One record per date+shift slot; the slot is the identity (that's how the sheet stores it).

localStorage keys: `westside_vapes_script_url`, `westside_vapes_timesheets_data` (all months, flat),
`westside_vapes_timetable_data`, `westside_vapes_employees_data`.

**Demo mode:** the saved URL is empty or contains `your-apps-script-url`. All reads and writes then go
to localStorage only. A saved URL containing `SAMPLE_WESTSIDE_VAPES` is replaced by the live default URL,
so it can't be used for demo mode.

## Sheet layout

### Month tabs: `MM-YYYY` (e.g. `10-2026`), copied from `Template`
Confirmed against the live `10-2026` tab on 2026-10-09:

| Row | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Date | Morning | | | | Evening | | | |
| 2 | | Employee Name | In | Out | Hours | Employee Name | In | Out | Hours |
| 3…33 | day 1…31 | name | in | out | hours | name | in | out | hours |

- **Row = day + 2.** The app maps rows by position and ignores column A's value.
- On every write, column A gets the string `MM/DD/YYYY`; the sheet's locale may convert it to a date.
- In/Out cells are set to number format `HH:mm` on write.
- **Hours (E, I) are sheet formulas the owner controls; the app never reads or writes them.** Exact
  minute columns arrive in Phase 1B (D-021).
- Month tabs created by the script get warning-only protection.
- Rows past the month's last day are ignored.

### `Employees`
Column A, header in row 1, one name per row from row 2. Read by `getEmployees`. `addEmployee(name)` in
Code.gs appends a row, but the app doesn't call it. (Layout inferred from the code, not inspected live.)

### `Timetable`
Column A = day name (`Sunday`…`Saturday`, matched case-insensitively), B = Morning employee,
C = Evening employee. Any other rows and columns are ignored. (Inferred from the code.)

## Apps Script contract (`apps-script/Code.gs`)

### GET
| Request | Response |
|---|---|
| `?action=getEmployees` | `["Name", …]`: non-empty values of `Employees!A2:A`; `[]` if the tab is missing |
| `?action=getTimesheet&monthYear=MM-YYYY` | 2-D array of **display strings** for the whole tab (`getDisplayValues`); `[]` if the tab doesn't exist (**no tab is created**) |
| `?action=getTimetable` | 2-D array of raw values (`getValues`); `[]` if the tab is missing |
| anything else / bad `monthYear` | `{status:"error", message}` |

### POST (JSON body sent as `text/plain;charset=utf-8`)
Every POST waits up to 10 s for the script lock; on timeout it returns
`{status:"error", message:"Server busy, please try again in a moment."}`.

**Save shift:** `{monthYear:"MM-YYYY", date:1-31, shift:"Morning"|"Evening", name, inTime:"HH:mm", outTime:"HH:mm", force:bool}`
- Validation: `monthYear` must be `01-12`-`YYYY`; `date` must exist in that month; `shift` must be
  Morning or Evening; when `name` is set, both times must parse (`H:mm`, `HH:mm[:ss]`, `h:mm AM/PM`).
- If the slot has different data and `force` isn't true: `{status:"conflict", previousData:{name,inTime,outTime}}`.
  Nothing is written.
- Otherwise it writes (creating the month tab from `Template` if needed) and returns
  `{status:"success", previousData}`.

**Delete shift:** the same payload with `name`, `inTime` and `outTime` set to `""` and `force:true`.

**Update roster:** `{action:"updateTimetable", timetable:[{dayName, morning:[{employeeName}], evening:[{employeeName}]}…]}`
- Writes B/C on each matching day row, appends missing days, and ignores names that aren't days.
- Creates the `Timetable` tab (header `Day | Morning | Evening`) if it's missing. Returns `{status:"success"}`.

Errors: `{status:"error", message}`. **The frontend treats any status other than `success` or `conflict`
as a failure and tells the user the change was NOT saved.**

### Client conflict flow
1. `submitShiftApi` first compares against the local cache; a mismatch opens the conflict modal with no
   network call.
2. Otherwise it POSTs with `force:false`. A server `conflict` also opens the modal.
3. Overwrite resends with `force:true`. Edits and deletes from the Timesheet tab always send `force:true`.

### Compatibility with the pre-Phase-0 backend
The frontend still works if the old script is deployed:
- Times come back as ISO strings; the client parses them.
- `getTimesheet` creates missing month tabs.
- `force` is ignored, so there are no server-side conflicts.
- `updateTimetable` doesn't exist: roster saves fail with an error, and the old script leaves a
  stray "Copy of Template" tab.

## Redeploy

### Frontend
1. Merge the PR into `main`.
2. The GitHub Action "Deploy React App to GitHub Pages" builds and publishes. The expected URL is
   https://satyendra-varma.github.io/WestSide-Vapes-Timesheet/ (check repo Settings → Pages).

### Backend (Apps Script)
1. Open the Google Sheet → **Extensions → Apps Script**.
2. Replace `Code.gs` with `apps-script/Code.gs` (or copy it from app Settings → Copy Backend Script),
   then save.
3. **Deploy → Manage deployments** → pencil on the existing deployment → **Version: New version** → Deploy.
   The URL stays the same.
   - If you use *New deployment* instead, the URL changes. Then update `DEFAULT_APPS_SCRIPT_URL` in
     `src/config.ts` (and any URL saved on devices via Settings).
   - Settings: Execute as **Me**, Who has access **Anyone**.
4. Run the post-deploy checks in `QA.md`.

The frontend and backend can be deployed in either order (see Compatibility above).

## Known gaps (tracked in PLAN.md)
- Write endpoints are unauthenticated and the URL is public (repo and bundle): anyone can change
  timesheets.
- Names aren't checked against `Employees`; a value starting with `=` would be written as a formula.
- `githubPagesExport.ts` posts `{action:"submitShift", employeeName, date:"YYYY-MM-DD", …}`, which neither
  backend understands, so its saves fail. Its monthly view reads only its own localStorage.
- The header pill says "Live" in demo mode.
- `@types/react` isn't installed, so React code is effectively untyped (fixed in Phase 3).
- CI doesn't run tests yet (Phase 3).
- Employee-name variants (case or extra spaces inside the name) count as separate people.
