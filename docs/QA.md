# QA

## Before every commit
1. `npm run lint` (tsc): exit 0.
2. `npm run build`: succeeds.
3. `npm test` (Vitest): all green. This includes `tests/backend/bundle.test.ts`, which fails if
   `apps-script/Code.gs` wasn't regenerated (`npm run build:gas`).
4. The manual checks below that cover the change, run against the mock backend.

Never commit on a failing check. Never write test data to the live sheet.

## CI
`.github/workflows/ci.yml` runs on every push and pull request to any branch: `npm ci` → `npm run lint`
(strict tsc) → `npm run check:gas` → `npm run build` → `npm test`. A red CI run means: don't merge.

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
| `tests/backend/util.test.ts` | backend pure helpers: time/date/month parsing, PIN rules, formula-injection guard, constant-time compare, signed-byte hex, active flag |
| `src/utils/csv.test.ts` | CSV injection guard (`= + - @` tab CR), RFC 4180 quoting, BOM/CRLF, summary + daily rows, totals equal the sum of daily minutes |
| `tests/backend/completeness.test.ts` | edit/delete conflict when the slot changed since it was loaded, audit who/when/old→new, shared roster |
| `tests/store.test.ts` | cache staleness rules for refresh-on-focus |
| `tests/shiftQueue.test.ts` | offline queue: dedupe, cap, corrupt storage, owner isolation, send order, retry vs failed, never sends another user's entries |
| `tests/pwa.test.ts` | real `sw.js` in a vm: ignores POST, cross-origin, `/exec`, `?action=`, out-of-scope; caches only ok same-origin static files; network-first shell; old caches removed; manifest + icons |
| `tests/backend/audit.test.ts` | `getAudit` manager-only, newest first, paging, timestamp format, limit clamping, no PINs |
| `tests/backend/stockRequests.test.ts` | stock add/update/resolve/validation; requests minimal fields, phone formats, no name/phone in errors, logs or audit, roles, formula-looking names, purge by age and setting, `installTriggers` idempotent |
| `tests/stockRequestsClient.test.ts` | phone normalisation, `tel:` links, frontend/backend parity, requests CSV guard |
| `tests/backend/cash.test.ts` | denomination totals in cents, no float drift, validation, one count per day, float snapshot, staff/manager/date rules, history, float setting, `centsText` |
| `tests/money.test.ts` | cents formatting, dollar parsing from text, count parsing, denominations, frontend/backend parity |
| `tests/codeRules.test.ts` | no `any`; no hours arithmetic outside `hours.ts`; no pay/wage logic in shipped code; only the URL override in localStorage; no console logging |

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
- [ ] Hours by Employee is a table (Employee / Shifts / Hours / Decimal / Review + Total); tapping a
      name filters the list.
- [ ] Manager: **Summary CSV** and **Shifts CSV** download `westside-hours-<MM-YYYY>-<period>…csv`.
      They open in Excel or Sheets with correct names; the minutes column adds up to the total. A name
      starting with `=` shows as text. Staff have no CSV buttons.
- [ ] Each shift row shows `6h 20m` with `6.33 h` underneath.

- [ ] Two browsers as manager: open Edit on the same shift in both, save in A, then save in B. B says
      the shift changed on another device, shows the current values, refreshes, and writes nothing.
      Same for Delete.
- [ ] Switch to another tab for over a minute and come back: the Timesheet and roster re-fetch.

**Timetable**
- [ ] Staff see the roster without Edit buttons; the manager edits a day and the change persists across
      a refresh and from another browser.

**Offline queue (shift logs only)**
- [ ] Devtools → Network → Offline (or stop `npm run mock`), then submit a shift: an amber toast says
      it's saved on this device; Log Shift shows "Not sent yet (1)"; the header shows "1 unsent".
- [ ] Logout while unsent: a dialog offers "Stay logged in" / "Delete and log out".
- [ ] Back online: within 30 s (or "Send now") the item disappears and the shift is in the Timesheet.
- [ ] Queue a shift for a slot someone else then fills: it becomes "Not saved: Already logged …" and
      Discard asks for confirmation.
- [ ] Edits, deletes and roster saves while offline show "not saved" and are not queued.

**PWA**
- [ ] `npm run build -- --mode mock` + `npx vite preview` (with `npm run mock` running): Application →
      Service Workers shows `sw.js` active for `/WestSide-Vapes-Timesheet/`; Application → Cache
      Storage `wsv-static-v1` holds only `/WestSide-Vapes-Timesheet/`, `assets/*.js`, `assets/*.css`
      (+ icons/manifest), never an `/exec` response.
- [ ] Chrome shows an install option; the installed app opens standalone with the green bolt icon.

**Accessibility**
- [ ] Every input has a label; icon buttons have aria-labels; dialogs trap focus and close with Escape.
- [ ] Buttons and inputs are at least 44 px tall; secondary text is slate-400 or lighter.

**Stock & Requests**
- [ ] Stock: add "Coil 0.4ohm" as Out; it shows with your name and time; ticking Resolved moves it to
      "Show resolved"; Reopen works; reporting the same product again updates it.
- [ ] Requests: "555-0123" is refused ("Enter a 10-digit phone number…"); "(604) 555-0123" is saved
      as 604-555-0123. The privacy line "Used only to contact you about this request." is visible.
- [ ] Requests with the same product in different case are grouped together; the product field
      suggests earlier products.
- [ ] Tapping the phone opens the dialer (`tel:+1…`).
- [ ] Staff: can change status; no Delete, no purge setting, no Export.
- [ ] Manager: Delete (with confirm), purge days (1–365), Export requests CSV.
- [ ] Revoke the session (manager resets your PIN elsewhere): customer names and phones disappear from
      the screen as soon as the re-login prompt shows.
- [ ] Devtools → Application: no customer data in Local/Session Storage or Cache Storage.
- [ ] Audit tab: request rows show only the ID and the status, never a name, phone or product.

**Cash count**
- [ ] Enter 12 × $20, 9 × 25¢, 3 × 10¢, 1 × 5¢: Total $242.60. With a $200.00 float, Difference
      shows +$42.60 in amber. With Total = float it's green.
- [ ] A count of `1.5` or `-1` is refused (red field, Save disabled).
- [ ] Saving again today updates the same day ("Update today's count"); the Audit tab shows
      `cash.update` with old → new totals.
- [ ] Staff: no float setting, no history, can only count today.
- [ ] Manager: set float (dollars, e.g. `200.50`); History → month → Edit a past day → save.
- [ ] `CashCounts` tab: one row per day, whole-number counts, totals in cents.

**Manager Settings → Audit log**
- [ ] "Show latest" lists entries newest first; the filter narrows them; "Load older" pages when there
      are more than 50.

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
