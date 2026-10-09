# QA

## Before every commit
1. `npm run lint` (tsc): exit 0.
2. `npm run build`: succeeds.
3. `npm test` (Vitest): all green. This includes `tests/backend/bundle.test.ts`, which fails if
   `apps-script/Code.gs` wasn't regenerated (`npm run build:gas`).
4. The manual checks below that cover the change, run against the mock backend.

Never commit on a failing check. Never write test data to the live sheet.

## Automated suites
| Suite | Covers |
|---|---|
| `src/utils/hours.test.ts` | minutes, formatting, 31 × 6h20m = 196h 20m, round-then-sum regression, overnight, invalid times, per-employee totals |
| `src/utils/periods.test.ts` | semi-monthly split, month lengths |
| `src/utils/appsScriptTemplate.test.ts` | Settings export = `apps-script/Code.gs` |
| `tests/backend/bundle.test.ts` | `Code.gs` = concatenated `src/*.js`; no hardcoded PIN or secret |
| `tests/backend/auth.test.ts` | login, generic errors, lockout + expiry + unlock, token tamper/expiry/foreign secret/revocation, active flag on every request, roles, no data without token, PIN rules, setup function, no PIN/token stored anywhere |
| `tests/backend/timesheet.test.ts` | save, conflict, force rules (staff vs manager), validation, inactive employees, audit, read formats, delete, timetable |
| `tests/backend/hardening.test.ts` | plain-text In/Out, legacy Date reads, exact formula strings (integer minutes, no decimal hours), columns on new tabs, `migrateSheets` additive/idempotent/skip-on-conflict |
| `tests/apiClient.test.ts` | real client ↔ real backend: transport (text/plain, token only in body), v1-backend refusal, network errors, conflicts, validation fields, unauthorized hook |
| `tests/session.test.ts` | session only in sessionStorage, expiry, legacy purge, cache clearing, frontend/backend time-parsing parity |

The backend tests run the **generated `Code.gs`** in a Node `vm` with fake Google services
(`mock-backend/`). Fake-clock time is 2026-10-09 13:00 America/Vancouver unless a test advances it.

## Manual end-to-end (mock backend, fake data)
1. Terminal 1: `npm run mock`. Note the demo names and PINs it prints (random per run).
2. Terminal 2: `npm run dev:mock`, then open http://localhost:3000/WestSide-Vapes-Timesheet/ on a phone-sized window.
3. In devtools → Network, check: before login only `GET …/exec` (version check) is sent; afterwards
   only `POST`s with `Content-Type: text/plain`, and no token in any URL.

**Login and session**
- [ ] A wrong PIN shows "Name or PIN is incorrect." The 5th wrong PIN shows the lockout with minutes.
- [ ] Staff login: header shows name + STAFF, no gear icon; Log Shift name is fixed to self.
- [ ] Manager login: MANAGER badge, gear icon, employee dropdown on Log Shift.
- [ ] Storage after login: sessionStorage has `wsv_session` only; localStorage is empty.
- [ ] Logout returns to the login page; sessionStorage is empty and no names remain on the page.
- [ ] Revocation: while staff is logged in, the manager resets their PIN from another browser. The
      staff member's next action shows "Session expired" over the screen with their form intact;
      re-login with the new PIN continues where they were; "Not <name>? Log out" fully logs out.

**Log Shift**
- [ ] In = Out → "Shift length is 0"; out before in → past-midnight warning; over 12 h → warning.
- [ ] Logging into a colleague's slot (staff): conflict dialog says only a manager can replace it, with
      no Overwrite button.
- [ ] Own slot with different times: Overwrite works and the toast shows the new duration.
- [ ] Dialog: focus starts inside, Tab stays inside, Escape closes.

**Timesheet**
- [ ] Totals equal hand-summed minutes (the mock seeds odd end times like 15:20 and 16:05).
- [ ] Staff see Edit only on their own rows and no Delete; the manager sees both.
- [ ] Edit (staff, own row) saves; Delete (manager) removes the row.
- [ ] Period switch and the Copy summary work; flagged shifts show the amber `0h`.

**Timetable**
- [ ] Staff see the roster without Edit buttons; the manager edits a day and the change persists across
      a refresh and from another browser.

**Manager Settings → Staff & PINs**
- [ ] A weak PIN (`111111`, `123456`) is refused; a good one shows the "Tell them in person" message.
- [ ] Deactivate (confirm) → "Inactive"; that person's open session dies on their next action; reactivate.
- [ ] A locked employee shows "Locked" with an Unlock button.
- [ ] No deactivate button on your own row.
- [ ] Server address: "Test" on the mock URL says v2; a wrong URL shows an error; "Save & log out" logs out.

## Staging checks (owner, on the staging copy of the Sheet)
See `MORNING_CHECKLIST.md` step 4. Additionally:
- [ ] The `Audit` tab gets rows for logins, PIN sets and shift changes, and never shows a PIN.
- [ ] `Employees` gained `Role` / `Active` columns at the end; nothing else moved.
- [ ] Opening a future month in the Timesheet doesn't create a tab.
- [ ] After `migrateSheets`: J/K minutes per row (overnight shift, e.g. 16:00–00:30 = 510); M–Q per
      employee; N1+O1 = P1; Q shows h:mm. Totals equal the app's Hours by Employee.
- [ ] A row the app writes has In/Out as plain text (left-aligned, `09:00`); old rows still show times.
- [ ] Re-running `migrateSheets` reports `present` and changes nothing.

## Earlier evidence
- **Phase 0 (2026-10-09):** 15 × 6h 20m showed 94.5 h in the old app vs the correct 95h 0m. The browser
  demo matched hand-calculated totals.
- **Phase 1A (2026-10-09, mock backend, 375 px):** login, wrong PIN, staff/manager role gating,
  staff-vs-colleague conflict, own-slot overwrite, mid-session revocation with the form preserved and
  re-login, logout wiping storage, staff management (deactivate/reactivate, weak PIN refused, PIN set,
  self-deactivate hidden), roster edit, manager delete. Totals matched hand calculation
  (7,010 min = 116h 50m). No console errors.
