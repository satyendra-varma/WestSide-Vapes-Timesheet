# Project reference

Describes the code on `dev` (updated as phases merge). `main` is the live site and runs the old v1 app
until the owner merges; see `PROGRESS.md` for status.

## What it is
A mobile-first web app for WestSide Vapes (Kerrisdale) staff:
- **Log Shift:** staff log their own shifts; the manager can log for anyone.
- **Timesheet:** month view, pay periods (full / 1–15 / 16–end), hours per employee, edit/delete.
- **Timetable:** weekly roster (one person per Morning/Evening slot); the manager edits it.
- **Manager Settings:** staff PINs, unlocks, activate/deactivate, server address, backend code.

There's no server or database of our own. The Google Sheet is the system of record, behind an Apps
Script web app. The app holds data in memory only, for the length of a session.

## Architecture

```
 Browser: React SPA on GitHub Pages (static)
   │  sessionStorage: session token only        localStorage: nothing (except a manager's server override)
   │  in-memory cache: employees / timesheet months / roster, wiped on logout or expiry
   │
   │  GET  (no params)        -> {apiVersion: 2}        version check only, returns no data
   │  POST {action, token, …} as text/plain (no CORS preflight; token never in the URL)
   ▼
 Apps Script web app (apps-script/Code.gs, generated from apps-script/src/*.js)
   │  login -> PIN check -> HMAC-signed token
   │  every other action -> verify token + employee active + token version + role
   │  writes under the script lock; every change appended to the Audit tab
   ▼
 Google Sheet: Template · MM-YYYY month tabs · Employees · Timetable · Audit
 Script Properties: TOKEN_SECRET · PIN_PEPPER · auth.user.<name> (salt, hash, failures, lock, token version)
```

- Stack: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, lucide-react, Vitest 3.
- Hosting: `.github/workflows/deploy.yml` deploys `main` to GitHub Pages (base `/WestSide-Vapes-Timesheet/`).
  Claude never touches `main` or that workflow.
- Unused dependencies left over from the AI Studio template: `@google/genai`, `express`, `dotenv`,
  `motion`, `@types/express` (Phase 3).

## File map

| Path | Purpose |
|---|---|
| `apps-script/src/*.js` | **Backend source**, concatenated in filename order. Shared global scope like Apps Script. `00_config` constants · `01_util` pure helpers · `02_services` Apps Script wrappers · `03_audit` · `04_employees` · `05_auth` · `06_timesheet` · `07_timetable` · `08_staff` · `09_month_formulas` minute columns + `migrateSheets` · `90_api` router · `95_setup` owner-run functions. |
| `apps-script/Code.gs` | **Generated** single file the owner pastes into Apps Script (`npm run build:gas`). `tests/backend/bundle.test.ts` fails if it's stale. |
| `scripts/build-apps-script.ts` | Bundler (`build:gas`, `check:gas`). |
| `mock-backend/fakeGoogle.ts` | In-memory SpreadsheetApp, PropertiesService, LockService, Utilities, ContentService, MailApp, ScriptApp, and a controllable clock. |
| `mock-backend/loadBackend.ts` | Runs the real `Code.gs` in a Node `vm` sandbox with those fakes. |
| `mock-backend/seed.ts` | Fake sheet, employees, random PINs; helpers for tests. Fake names only. |
| `mock-backend/server.ts` | `npm run mock`: HTTP mock backend on :8787 for end-to-end testing (`npm run dev:mock`). |
| `src/config.ts` | `SHOP_INFO`, `API_VERSION`, `APPS_SCRIPT_URL` (empty on dev; set at merge), env/override lookup. |
| `src/api/client.ts` | Transport: POST text/plain, typed `ApiError`, version check, unauthorized hook. |
| `src/api/backend.ts` | Typed wrappers per action; `createBackendApi(token)`. |
| `src/api/types.ts` | Contract types. |
| `src/auth/session.ts` | Session in sessionStorage; purge of v1 localStorage caches. |
| `src/auth/AuthContext.tsx` | Login/logout, expiry timer, re-login overlay state, bound API. |
| `src/data/store.ts`, `src/data/hooks.ts` | In-memory cache + `useResource`; employees/timesheet/roster hooks. |
| `src/utils/hours.ts` | **Only** place hours are computed (integer minutes). |
| `src/utils/periods.ts` | Semi-monthly pay periods. |
| `src/utils/appsScriptTemplate.ts` | `?raw` re-export of `apps-script/Code.gs` for Settings → Copy. |
| `src/components/LoginScreen.tsx` | Login page and the "session expired" overlay. |
| `src/components/Modal.tsx` | Accessible dialog (focus trap, Escape, focus restore). |
| `src/components/{ShiftLoggingTab,MonthlyTimesheetTab,TimetableTab,ConflictModal,Header,BottomNav}.tsx` | Screens. |
| `src/components/{SettingsModal,StaffManager}.tsx` | Manager-only settings and staff/PIN management. |
| `tests/**`, `src/**/*.test.ts` | Vitest suites (`npm test`). |
| `.env.mock` | `VITE_APPS_SCRIPT_URL=http://localhost:8787/exec` for `npm run dev:mock` (not a secret). |

## Data model (frontend)

```ts
ShiftRecord { id: "shift_YYYY-MM-DD_Morning|Evening", employeeName, date: "YYYY-MM-DD",
              shift: "Morning"|"Evening", inTime: "HH:mm", outTime: "HH:mm" }
```
Minutes always come from `shiftMinutes(inTime, outTime)` (overnight-safe; missing, invalid or equal times
give 0 and the shift is flagged for review). One record per date+shift slot.

## Sheet layout

### Month tabs `MM-YYYY`, copied from `Template` on the first write of a month
| Row | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Date | Morning | | | | Evening | | | | | | | All staff | 1–15 min | 16–end min | month min | h:mm |
| 2 | | Employee Name | In | Out | Hours | Employee Name | In | Out | Hours | Morning Min | Evening Min | | Employee | 1-15 min | 16-end min | Month min | Month h:mm |
| 3…33 | day 1…31 | name | in | out | hours | name | in | out | hours | minutes | minutes | | per-employee totals (array formulas from row 3) | | | | |

- Columns A–I are the original layout and never move. J–Q (Phase 1B) are additive. L is left empty as a
  spacer.
- Row = day + 2. Rows past the month's last day are ignored.
- On every write, A gets `MM/DD/YYYY`. In/Out are written as **plain text** `HH:mm` (number format `@`
  set first). Older rows may hold time values; reads handle both.
- **J/K** = integer minutes per shift:
  `=IF(OR(C3="",D3=""),"",IFERROR(MOD(ROUND((TIMEVALUE(TEXT(D3,"HH:mm"))-TIMEVALUE(TEXT(C3,"HH:mm")))*1440),1440),"CHECK"))`.
  Past-midnight safe; `CHECK` means a time can't be read.
- **M–Q** = totals that SUM minutes and show h:mm; no decimal hours anywhere.
  - Row 1 = all staff (N 1–15, O 16–end, P month, Q h:mm).
  - Rows 3+ = one row per employee who appears that month (`FLATTEN/UNIQUE/SUMIF` array formulas
    anchored in M3:Q3).
- Hours (E, I) are the owner's own formulas; the app never reads or writes them (D-035).
- New month tabs get warning-only protection.
- Reads accept time values (Dates), day-fraction numbers, `HH:mm[:ss]` and `h:mm AM/PM` text.
  Anything else is returned as-is and flagged.

### `Employees`
- Row 1 is a header; column A holds names from row 2.
- Optional columns are found by their row-1 header (case-insensitive) and appended only when needed:
  - **Active**: blank or anything except `FALSE/no/0/inactive` means active.
  - **Role**: `manager` or anything else (staff).
  - **Email**: Phase 8.
- Duplicate names: the first row wins. Rename = new person (needs a new PIN).

### `Timetable`
A = day name (case-insensitive), B = Morning employee, C = Evening employee. Other cells untouched.

### `Audit` (created automatically)
Timestamp | Actor | Action | Target | Details. Actions:
- Auth: `login.success`, `login.failed`, `login.blocked`, `login.locked`
- Staff: `pin.set`, `employee.unlock`, `employee.activate`, `employee.deactivate`
- Data: `shift.create`, `shift.update`, `shift.delete`, `timetable.update`
- Setup: `setup.managerPin`

Never contains PINs, tokens or customer data. User-supplied text is written with a leading apostrophe
if it starts with `= + - @` (formula-injection guard).

### Script Properties (Project Settings → Script properties)
- `TOKEN_SECRET` and `PIN_PEPPER`: random, created on first use.
- `auth.user.<lower-case name>`: `{salt, hash, failed, lockedUntil, tv}`.
- `SETUP_MANAGER_NAME` / `SETUP_MANAGER_PIN`: temporary, deleted by `setManagerPin`.

Anyone with edit access to the Sheet or script can bypass auth (D-018).

## Apps Script contract (v2, `API_VERSION = 2`)

All responses include `apiVersion: 2` and one of:
`{status:"success", data}` · `{status:"error", code, message, field?, retryAfterMinutes?}` ·
`{status:"conflict", code:"conflict", message, previousData:{name,inTime,outTime}}`.

Error codes: `unauthorized` (bad, expired or revoked token: the app shows re-login) · `forbidden` (role)
· `invalid` (+`field`) · `invalid_credentials` · `locked` (+`retryAfterMinutes`) · `not_found` · `busy`
(lock timeout) · `server_error`.

| Action | Who | Params | Data |
|---|---|---|---|
| `login` | anyone | `name`, `pin` | `{token, expiresAt, user:{name, role}}` |
| `getEmployees` | staff: active names; manager: all + `hasPin`, `lockedUntil` | – | `[{name, role, active, …}]` |
| `getTimesheet` | any | `monthYear` `MM-YYYY` | `{monthYear, records:[{date, shift, name, inTime, outTime}]}` (`[]` if no tab; never creates one) |
| `saveShift` | staff: own name only; manager: anyone | `date` `YYYY-MM-DD`, `shift`, `name`, `inTime`, `outTime`, `forceOverwrite?` | `{previousData}` or `conflict` |
| `deleteShift` | manager | `date`, `shift` | `{previousData}` |
| `getTimetable` | any | – | `[{dayName, morning, evening}]` × 7 |
| `updateTimetable` | manager | `timetable:[{dayName, morning, evening}]` | updated timetable |
| `setPin` | manager | `name`, `pin` | `{name}`. Resets lockout and ends that person's sessions. |
| `unlockEmployee` | manager | `name` | `{name}` |
| `setEmployeeActive` | manager (not self) | `name`, `active` | `{name, active}`. Deactivation ends sessions. |

**saveShift rules** (inside the script lock):
- `date` must be a real date, not in the future (spreadsheet time zone); `shift` Morning or Evening;
  times `HH:mm` and not equal; `name` an existing, active employee.
- Occupied slot with different data and no `forceOverwrite:true` → `conflict`, nothing written.
- Staff can only overwrite their own slot; replacing someone else's needs the manager.

**Auth** (D-018):
- PIN hash = HMAC-SHA256(PIN_PEPPER, salt + ":" + pin).
- Token = `encodeURIComponent(JSON{n, r, v, iat, exp})` + "." + hex HMAC-SHA256(TOKEN_SECRET, payload).
- Staff tokens last 8 h, manager 2 h.
- 5 wrong PINs lock that employee for 15 min.
- Wrong PIN, unknown name, inactive and no-PIN all give the same `invalid_credentials`.
- Weak PINs (one repeated digit, straight runs) are rejected.

## Redeploy / rollout (owner)
Full step-by-step in `MORNING_CHECKLIST.md`. Summary:
1. Back up the Sheet.
2. Test on a staging copy first.
3. In the real Sheet's Apps Script, paste `apps-script/Code.gs`, then **Deploy → New deployment**. This
   gives a NEW URL; the old deployment keeps serving the live v1 app.
4. Run `setManagerPin` once, then set staff PINs from the app.
5. When merging `dev` → `main`, set `APPS_SCRIPT_URL` in `src/config.ts` to the NEW URL.
6. After the live site works, archive the old deployment.

The v2 app refuses any URL that doesn't report `apiVersion: 2`, so it can never send requests to the v1
script.

## Migration notes
- **Employees:** `setManagerPin` (and later deactivation) appends `Role` / `Active` header columns after
  the last used column if they're missing. Existing columns aren't moved. Blank Active = active,
  blank Role = staff.
- **Audit tab:** new, created on the first audited event.
- **Month tabs (Phase 1B):**
  - New tabs get J/K/M–Q automatically on creation. Existing tabs and the Template get them when the
    owner runs `migrateSheets()` once.
  - Additive only: A–I are never changed.
  - A tab is skipped, untouched, if any target cell (J2:K33, M1:Q33) already holds something;
    the log names the first such cell.
  - Re-running is harmless.
  - The Template's empty In/Out cells (C3:D33, G3:H33) are set to plain text so manual entries stay
    text too. Existing tabs keep their formats; only cells the app writes become text.
  - If the owner's Hours formulas in E/I can't handle text times (they show `#VALUE!` on new rows),
    use J/K, or wrap their references in `TIMEVALUE()`.
- **Browser:** v1's localStorage caches (`westside_vapes_*`) are deleted on first load of v2.
- **Legacy standalone HTML export:** removed (couldn't authenticate; its request format was already
  broken).

## Known gaps (tracked in PLAN.md)
- Phase 3: CI on GitHub, strict TypeScript, unused-dependency cleanup.
- Phase 5: offline queue (a network error now means "not saved, try again"), PWA, in-app confirm dialogs.
