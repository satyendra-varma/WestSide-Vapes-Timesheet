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
The optional `fixHoursFormulas()` makes them minute-exact (`ROUND(MOD(out-in,1)*1440)/60`, shown as
`0.00`), so sheet totals agree with the app. The owner runs it by hand because it overwrites formulas;
it only touches tabs whose row-2 header in E/I is "Hours".

## D-003: Month rows are mapped by position (row = day + 2), not by column A
*2026-10-09 · Accepted · Phase 0*

Column A can hold a date, the string `MM/DD/YYYY`, or nothing, depending on the sheet's locale. Parsing it
can give the wrong day (if the cell stays a string, `parseInt("08/15/2026")` → day 8). This was found in
code review, not seen in live data. `doPost` already writes by position, so reads do
too. Rows past the month's last day are ignored.

## D-004: getTimesheet returns display values; the client parses several time formats
*2026-10-09 · Accepted · Phase 0*

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
*2026-10-09 · Accepted · Phase 0*

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

