# Decisions

Newest at the bottom. Each entry: context, decision, why, consequences. Supersede an entry by adding a
new one; don't edit history.

## D-001: Shift durations are integer minutes; decimal rounding rejected
*2026-10-09 · Accepted · Phase 0*

**Context.** The app rounded every shift to 0.1 h (`Math.round(h * 10) / 10`) and added the rounded values.
6h 20m became 6.3 h (−2 min) and 6h 40m became 6.7 h (+2 min), so each shift could be off by up to
±3 min. Shifts at a shop tend to end at the same odd minute, so the errors don't cancel out. 15 shifts of
6h 20m totalled **94.5 h instead of 95 h**: 30 minutes unpaid for one person in one pay period.

**Decision.** Compute every duration as whole minutes from In/Out (`shiftMinutes`), add up minutes, and
convert to hours only to display a final total (`6h 20m` / `6.33 h`). Pay should be
`total minutes × rate ÷ 60`, rounded to cents once per period. `ShiftRecord` has no hours field.

**Rejected:**
- *Round to 2 decimals.* Still rounds before adding (6h 20m → 6.33 loses 0.2 min every shift); it only
  makes the drift smaller.
- *Store unrounded decimal hours.* Thirds and sixths of an hour can't be stored exactly as floats, and
  a stored derived value can disagree with the In/Out times it came from.
- *Display-only fix.* Any total built from per-shift rounded numbers is still wrong.

**Consequences.** All totals go through `src/utils/hours.ts`. The sheet's Hours column is display-only for
the app (D-002).

## D-002: In/Out times are the source of truth; the sheet's Hours column is display-only
*2026-10-09 · Accepted · Phase 0*

The app never reads Hours (E/I); it recomputes from In/Out. The owner controls the sheet formulas.
(Superseded in part by D-021.) The optional `fixHoursFormulas()` made them minute-exact (`ROUND(MOD(out-in,1)*1440)/60`, shown as
`0.00`), so sheet totals agree with the app. The owner runs it by hand because it overwrites formulas;
it only touches tabs whose row-2 header in E/I is "Hours".

## D-003: Month rows are mapped by position (row = day + 2), not by column A
*2026-10-09 · Accepted · Phase 0*

Column A can hold a date, the string `MM/DD/YYYY`, or nothing, depending on the sheet's locale. Parsing it
can give the wrong day (if the cell stays a string, `parseInt("08/15/2026")` → day 8). This was found in
code review, not seen in live data. `doPost` already writes by position, so reads do
too. Rows past the month's last day are ignored.

## D-004: getTimesheet returns display values; the client parses several time formats
*2026-10-09 · Superseded by D-027 (v2 reads values and formats them server-side) · Phase 0*

`getValues()` turns time cells into 1899-epoch Dates serialised as UTC ISO strings. The browser converts
them back using its own historical time-zone offset, so times can shift if that offset differs from the
spreadsheet's. This was found in code review, not seen in live data. `getDisplayValues()` returns what the sheet shows. The
client accepts `H:mm`, `HH:mm:ss`, `h:mm AM/PM`, and ISO strings (for the old backend). Unrecognised
values are kept as-is, so they get flagged instead of guessed.

## D-005: GET is read-only; month tabs are created only on the first write
*2026-10-09 · Accepted · Phase 0*

Browsing months in the picker used to create empty tabs (e.g. `01-2030`). Now creation happens only in
`doPost`, under the script lock. `monthYear` is validated so junk tabs (e.g. "Copy of Template") can't
be created.

## D-006: Server-side conflict detection with an explicit `force` flag
*2026-10-09 · Accepted · Phase 0*

The local-cache check missed shifts logged on other devices, so the backend now refuses to change an
occupied slot unless `force:true`, and returns the existing values for the conflict modal. The cache
check stays as a fast path. Edits and deletes from the Timesheet tab send `force:true` because the user is
acting on that exact slot.

## D-007: A failed write is reported as a failure; no silent local-only saves
*2026-10-09 · Accepted · Phase 0*

The app used to report "saved locally" when a network error occurred, and showed success when the
backend returned an error. The local copy was wiped on the next refresh, so those hours were lost. The
user is now told the shift was NOT saved. A real retry queue is Phase 5.

## D-008: Missing or invalid times count as 0 and are flagged; never default them
*2026-10-09 · Accepted · Phase 0*

The app filled a missing In/Out with the default shift times (a full 7 h). Now the shift counts as 0 min,
gets an amber "0h" badge, and the period summary warns before payroll.

## D-009: No preselected employee name; it clears after each submit
*2026-10-09 · Superseded by D-023 (staff log under their own login) · Phase 0*

Shift logging likely happens on a shared device. Defaulting to the first name in the list made it easy to
log hours under the wrong person. A blank required choice forces a deliberate pick.

## D-010: `apps-script/Code.gs` is the single source for the backend
*2026-10-09 · Accepted · Phase 0*

The app had its own stale copy of the script as a string (`appsScriptTemplate.ts`). It now imports the
real file with Vite `?raw`, so Settings → Copy Backend Script always matches the repo.

## D-011: Payroll view uses semi-monthly periods (1–15, 16–end)
*2026-10-09 · Accepted · Phase 0*

This matches the owner's "per month or 15 days". Bi-weekly support is an open question (PLAN Phase 2).

## D-012: The frontend stays compatible with the currently deployed backend
*2026-10-09 · Superseded by D-020 (auth makes the v2 frontend and backend a matched pair) · Phase 0*

The owner redeploys the Apps Script by hand, so frontend and backend can go live in either order. New
request fields are ignored by the old script, and new response statuses are optional. The one known
gap: roster save fails, visibly, until the new script is deployed.

## D-013: Workflow: phase branches, no direct pushes to `main`, docs every session
*2026-10-09 · Superseded by D-019 · Process*

A push to `main` deploys to GitHub Pages. So: one phase per branch, audit then owner approval before
editing, lint + build (+ tests) before every commit, PRs merged by the owner, and PROGRESS/PLAN/DECISIONS
updated at the end of every session. Details in `CLAUDE.md`.

## D-014: The app never calculates pay
*2026-10-09 · Accepted · Owner instruction*

No hourly rates, wages or money derived from hours anywhere: frontend, backend, sheet formulas, exports
or tests. The app reports exact time worked (integer minutes, D-001). Payroll is done outside the app.
This keeps wage data out of a system that staff can log into and avoids a second place where pay could
be miscalculated. The only money feature is the end-of-day cash count (D-015).

## D-015: Money is stored and summed as integer cents
*2026-10-09 · Accepted · Owner instruction*

Cash-count amounts are integers in cents (e.g. 2 × $20 = 4000). They're formatted as dollars only for
display. Floats are never used for money; this is the same reasoning as D-001.

## D-016: Customer data is minimal, never cached in the browser, and purged
*2026-10-09 · Accepted · Owner instruction*

Customer requests store only name, phone, product, date and status.
- In the browser, they live in React state only: never localStorage, sessionStorage, the service-worker
  cache, or console logs. Logout clears them.
- Names and phone numbers never appear in error messages or audit text.
- Fulfilled requests are deleted after a configurable number of days by a time-driven trigger; the purge
  is logged by count only.
- Staff don't get a CSV export of customer data.

## D-017: Reminders are email only
*2026-10-09 · Accepted · Owner instruction*

Missed-shift-log reminders use Apps Script `MailApp` (free quota) to the employee's email in the
`Employees` tab. No SMS and no paid services.

## D-018: Authentication is name + 6-digit PIN with HMAC-signed tokens
*2026-10-09 · Accepted · Owner instruction*

**Why:** the frontend is static (GitHub Pages) with no server of its own, the staff is small, and Google
accounts for everyone are impractical. A PIN login checked by Apps Script, which returns a short-lived
HMAC-SHA256-signed token, needs no extra infrastructure.

**Design:**
- PINs are stored only as salted (and peppered) hashes in Script Properties.
- The signing secret is in Script Properties.
- Every request re-checks the token signature, expiry, the employee's active flag and a per-employee
  token version, so deactivation and PIN resets take effect immediately.
- Lockout: 5 failed PINs locks that employee for 15 minutes.

**Known limits:**
- A 6-digit PIN (10⁶ combinations) relies on the lockout.
- Lockout lets someone deliberately lock an employee out; the manager can unlock.
- Anyone with edit access to the Sheet or the script bypasses all of this.

Google Sign-In for the manager is a possible later upgrade.

## D-019: Unattended workflow with a `dev` integration branch
*2026-10-09 · Accepted · Process (supersedes D-013)*

- `main` is the GitHub Pages deploy branch; Claude never touches it or the deploy workflow.
- `dev` is the integration branch. Each phase is on `phase/<id>-<name>` cut from `dev` and merged
  back locally when build and tests pass.
- `dev` and phase branches are pushed to origin as backup.
- In unattended runs, the phase list in `PLAN.md` is pre-approved by the owner. Ambiguities are resolved
  toward the safer option and recorded here; owner-only actions go to `MORNING_CHECKLIST.md`.
- `PROGRESS.md` is updated with every commit.

## D-020: Auth rollout uses a new Apps Script deployment (new URL)
*2026-10-09 · Accepted · Owner instruction*

The authenticated backend is deployed as a **new** deployment with its own URL, so the live app (on
`main`, old URL) keeps working until the owner merges. The frontend's URL changes only in that merge;
afterwards the owner archives the old deployment.

Both deployments share the same spreadsheet. The new backend's sheet changes are additive (new
columns and tabs), so the old app keeps working during the overlap.

Because the v2 frontend speaks only the v2 contract, it refuses to log in unless the backend reports
`apiVersion: 2` (a no-data GET). This stops the new app from ever sending requests to the old script.

## D-021: No decimal-hours sheet formulas; `fixHoursFormulas` removed before any deploy
*2026-10-09 · Accepted · Phase 0*

`fixHoursFormulas` (session 1) wrote `ROUND(...*1440)/60` into the Hours columns E/I. It was never
deployed. It's removed because the owner asked for no decimal-hours formulas and because it overwrote
the owner's own columns. Phase 1B instead adds **new** integer-minute columns and a summary that sums
minutes. E/I stay as the owner left them.

## D-022: Hours helpers live only in `src/utils/hours.ts`; pay periods in `src/utils/periods.ts`
*2026-10-09 · Accepted · Phase 0*

Components import from these files instead of doing their own arithmetic (e.g. the 12-hour warning
uses `LONG_SHIFT_MINUTES`; the review flag uses `needsReview`). The legacy standalone HTML export has no
hours math, so there's nothing to mirror. It's removed in Phase 1A because it can't authenticate.

## D-023: Staff can only log and edit their own shifts
*2026-10-09 · Accepted · Phase 1A (safer option; supersedes D-009)*

With logins, the Log Shift name is fixed to the logged-in staff member, and the server rejects saves
for another name (`forbidden`).
- Staff may overwrite only their own slot. Replacing a colleague's slot, logging for others and deleting
  shifts are manager-only.
- Staff can still view everyone's month (unchanged behaviour; no pay data exists in the app).
- **Why:** shifts drive payroll, so the safer default is that nobody can change someone else's hours
  except the manager, and every change is audited.

## D-024: Session token in sessionStorage; server data in memory only
*2026-10-09 · Accepted · Phase 1A*

- The token is kept in `sessionStorage`: it survives a reload of the tab but not closing it. It's removed
  on logout and expiry.
- Employee lists, timesheets and the roster live in an in-memory cache that's cleared on logout and
  expiry; nothing is written to localStorage.
- v1's localStorage caches are deleted on first load.
- The only localStorage entry is a manager's optional server-address override (a URL, not data).
- **Why:** shared shop devices; the owner asked that no data be cached before login and that logout and
  expiry wipe cached data.

## D-025: Backend tests run the generated `Code.gs` in a Node vm instead of module.exports guards
*2026-10-09 · Accepted · Phase 1A (deviation from a suggested technique)*

Apps Script loads every file into one shared global scope, so the backend files call each other's
functions directly. Guarding each file with `module.exports` would need cross-file `require` shims that
don't exist in Apps Script. Instead, `mock-backend/loadBackend.ts` evaluates the exact generated
`Code.gs` in a `vm` context whose globals are fakes (`mock-backend/fakeGoogle.ts`), so tests exercise the
file that ships. The single-file `Code.gs` is generated from `apps-script/src/*.js`, and a test fails if
it's stale. `appsScriptTemplate.ts` is a `?raw` import of it, so the Settings export can't drift either.

## D-026: GET returns only the API version; the app checks it before sending anything else
*2026-10-09 · Accepted · Phase 1A*

`doGet` takes no actions and returns `{status:"error", code:"use_post", apiVersion:2}`: no data, so the
"only login is unauthenticated" rule holds. Before showing the login form, and on every response, the
app requires `apiVersion: 2`. The old v1 script answers GET without it, so a wrong URL is caught before
the app sends any action that the old script would misinterpret (it used to create junk tabs).

## D-027: Roles and the active flag live in the Employees tab; secrets in Script Properties
*2026-10-09 · Accepted · Phase 1A*

- `Role` and `Active` are header-located columns in `Employees`, appended only if missing (additive).
  This makes them visible to the owner.
- PIN hashes, failure counts, lockouts, token versions, the signing secret and the pepper live in Script
  Properties, never in the Sheet.
- Every request re-reads the employee row and the token version, so demotion, deactivation and PIN
  resets take effect immediately.
- v2 reads time cells with `getValues()`: Date values are formatted with `Utilities.formatDate` in the
  **spreadsheet's** time zone (the zone Sheets used to create them), and text is normalised. This is
  safer than the script time zone if the two differ.

## D-028: PIN rules
*2026-10-09 · Accepted · Phase 1A (safer option)*

- PINs are exactly 6 digits.
- One repeated digit (`111111`) and straight runs (`123456`, `654321`) are rejected.
- Hash = HMAC-SHA256(pepper, salt + ":" + pin), compared in constant time.
- Unknown names get a dummy hash so their timing matches.
- Wrong PIN, unknown, inactive and no-PIN logins all return the same message.
- Lockout counts per employee; unknown names can't be locked. A deliberate lockout of someone else is
  possible (known limit, D-018); the manager can unlock.

## D-029: Owner setup through temporary Script Properties
*2026-10-09 · Accepted · Phase 1A*

`setManagerPin()` takes no arguments (the editor's Run button can't pass any). It reads
`SETUP_MANAGER_NAME` and `SETUP_MANAGER_PIN` from Script Properties, stores only the hash, makes that
employee manager + active, and **always** deletes both properties, even on failure, so a PIN never sits
there in plain text.

## D-030: Session lengths: staff 8 h, manager 2 h
*2026-10-09 · Accepted · Phase 1A*

These follow the owner's "staff ~8h, manager shorter". The manager's shorter session limits exposure on
a shared device.

## D-031: Legacy standalone HTML export removed
*2026-10-09 · Accepted · Phase 1A*

The Settings "Download index.html for GitHub Pages" generator couldn't authenticate. Its request format
was already incompatible with both backends, and it was a second copy of the app to keep in step. The
app is deployed by GitHub Actions instead.

## D-032: Server-side shift validation includes "not in the future" and "not zero-length"
*2026-10-09 · Accepted · Phase 1A*

- The client already blocked these. The server now repeats the checks using the spreadsheet's time zone
  for "today", so a modified client can't log future or empty shifts.
- The employee must exist and be active.

## D-033: No backend URL in `dev`'s config; local dev uses `.env.mock` or `VITE_APPS_SCRIPT_URL`
*2026-10-09 · Accepted · Phase 1A*

`APPS_SCRIPT_URL` in `src/config.ts` is empty on `dev`, so a build can't accidentally talk to the old
deployment. The owner sets the new URL in the merge (MORNING_CHECKLIST step 6). `.env.mock` (committed,
not a secret) points `npm run dev:mock` at the local mock backend.

## D-034: `@types/react` added in Phase 1A instead of Phase 3
*2026-10-09 · Accepted · Phase 1A*

Without React types, every component was effectively `any`, so the 1A rewrite wouldn't have been
type-checked. Adding them early produced no errors. Strict mode itself stays in Phase 3.

## D-035: The sheet sums integer minutes in new columns; In/Out stored as text
*2026-10-09 · Accepted · Phase 1B*

- In/Out are written as plain text `HH:mm` (format `@`), so Sheets can't reinterpret them by locale or
  time zone.
- The minute-total part of D-021 lands here: new columns J/K hold integer minutes per shift by formula
  (`TIMEVALUE(TEXT(x,"HH:mm"))` reads both text and legacy time values; `MOD(…,1440)` handles midnight).
- M–Q total those minutes per employee and per half-month and show h:mm.
- Everything is additive: E/I (the owner's Hours formulas) and A–I positions are untouched.
- The migration skips, without writing anything, any tab where a target cell is occupied.
- **Why not rewrite E/I?** They're the owner's columns and may feed their payroll process; changing
  their meaning (decimal → minutes or h:mm) could silently change pay. The owner can switch to J–Q at
  their own pace.
- **Known:** the formulas can't be evaluated in tests (no Sheets engine). Their exact strings are
  tested, and the owner verifies them on the staging copy (MORNING_CHECKLIST step 4).

## D-036: CI is a separate checks-only workflow; repo rules are enforced by tests
*2026-10-09 · Accepted · Phase 3*

- `ci.yml` runs on every branch and PR: `npm ci`, strict typecheck, bundle freshness, build, tests.
  It has `contents: read` permissions only and no deploy steps; the owner's `deploy.yml` is untouched
  (owner instruction).
- `tsconfig` is `strict` (it passed with no changes needed).
- Rules that are easy to break silently are tests (`tests/codeRules.test.ts`): no `any`, no hours
  arithmetic outside `hours.ts`, no pay logic, no app data in localStorage, no console logging.
- Unused AI Studio dependencies were removed to cut install size and supply-chain surface.

## D-037: Payroll CSV export is manager-only, client-side, and time-only
*2026-10-09 · Accepted · Phase 2*

- The CSV is built in the browser from data the manager already has; no new backend action and no
  storage. It contains time only (minutes, h:mm, decimal hours), never money (D-014).
- Two files: per-employee summary (with an all-staff total) and daily shift rows, for the selected
  period and the employee filter, if one is set.
- Minutes are included so payroll can work from exact integers.
- Formula-injection guard: any cell starting with `= + - @` (plus tab and CR, per OWASP) gets a leading
  `'`.
- UTF-8 BOM and CRLF line endings for Excel.
- The plain-text Copy summary stays available to everyone because staff already see the same totals on
  screen.

## D-038: Edits and deletes are conditional on what the user saw; stale data refreshes on focus
*2026-10-09 · Accepted · Phase 4*

- `forceOverwrite` alone let a manager's edit, or a delete, silently replace a change made on another
  device after the dialog opened.
- Now the client sends the slot it displayed (`expectedPrevious` / `expected`). The server compares it
  inside the lock and answers `conflict` if it no longer matches. The UI says so, shows the current
  values, and reloads.
- To keep devices in step without polling, the in-memory cache re-fetches anything older than 60 s when
  the app regains focus.
- A "move shift to another date" action was considered and not added: it isn't in the plan, and
  delete + re-log covers it, with both steps audited.

## D-039: Offline queue for new shift logs only, in localStorage, per user
*2026-10-09 · Accepted · Phase 5 (refines D-007 and D-024)*

- When a new shift log fails with "no connection" or "server busy", it's queued in localStorage
  (`wsv_shift_queue`) instead of being lost. It needs localStorage to survive a reload or a dead
  battery.
- Only the shift fields are stored, tagged with the user who logged it.
- Edits, deletes, roster changes and customer data are never queued: they need a fresh view of the
  sheet.
- **Sending:** on login, when the browser comes back online, every 30 s while anything is waiting, and
  on "Send now". Always with the owner's own session; other users' entries are never sent and only
  their count is shown.
- **Visible state:**
  - a header pill "N unsent";
  - a "Not sent yet" list on Log Shift with per-item status, attempt count and failure reason;
  - Discard needs confirmation.
- **Failures:** conflicts and validation failures become "failed" (not retried) with the reason;
  network or busy errors stay queued; an expired session pauses until re-login.
- **Logout:** warns when the user has unsent items ("Stay logged in" / "Delete and log out") and then
  removes only that user's entries. Session expiry doesn't clear the queue, so re-login resumes
  sending.
- Switching servers is blocked while items are unsent.
- At most 50 entries.
- This is the one exception to "no data in localStorage": it's needed to avoid losing hours worked.

