# QA

> Phase 1A replaces localStorage demo mode with the mock backend (`npm run mock`); this file is
> updated per phase.

## Before every commit
1. `npm run lint`: must exit 0.
2. `npm run build`: must succeed.
3. `npm test`, once it exists (Phase 3).
4. The manual checks below that cover the change.

Never commit on a failing check. Report it with the output.

## Safe environments (never write test data to the live sheet)

### Demo mode (frontend only, no network writes)
1. `npm run dev`, then open http://localhost:3000/WestSide-Vapes-Timesheet/
2. In devtools, set the script URL to a demo value and seed data, then reload:
   ```js
   localStorage.setItem('westside_vapes_script_url', 'your-apps-script-url');
   localStorage.setItem('westside_vapes_employees_data', JSON.stringify(['Alex Demo','Sam Demo','Jordan Demo']));
   localStorage.setItem('westside_vapes_timesheets_data', JSON.stringify([
     { id:'shift_2026-10-01_Morning', employeeName:'Alex Demo', date:'2026-10-01', shift:'Morning', inTime:'09:00', outTime:'15:20', submittedAt:'' },
     { id:'shift_2026-10-02_Evening', employeeName:'Sam Demo', date:'2026-10-02', shift:'Evening', inTime:'', outTime:'23:00', submittedAt:'' },
   ]));
   ```
3. Note: the app fetches from the live default URL before you set demo mode. Those are GETs only.
   With the old backend, `getTimesheet` creates the current month's tab if it's missing.
4. Afterwards, run `localStorage.clear()`.

### Staging backend (end-to-end writes)
1. In Google Sheets: **File → Make a copy** (the bound script is copied too).
2. Deploy the copy's script as its own web app.
3. Point the app at the copy: Settings → Apps Script URL → Save (stored per device). Switch back when done.

### Backend logic without Google (mock harness)
Load `apps-script/Code.gs` into a Node `vm` context with a fake `SpreadsheetApp`, `LockService`,
`ContentService` and `Logger` (an in-memory 2-D array per tab). Call `doGet`/`doPost` and assert on the
cells. Compare arrays with `JSON.stringify`: arrays created inside the `vm` context fail
`assert.deepStrictEqual` across realms. The harness from Phase 0 was a scratch file; Phase 3 commits it.

## Manual regression checklist

**Log Shift**
- [ ] The name starts on "Select your name"; submitting without a name shows an error.
- [ ] In = Out → "Shift length is 0" and nothing is saved.
- [ ] An out time before the in time shows the "past midnight" warning; over 12 h shows its warning.
- [ ] Duration reads `7h · 7.00 h` for 09:00–16:00 and `6h 20m · 6.33 h` for 09:00–15:20.
- [ ] Logging into an occupied slot opens the conflict modal with both durations; Cancel writes nothing.
- [ ] After a successful submit the name resets to blank.
- [ ] A future date resets to today.

**Timesheet**
- [ ] Each employee's total equals the hand-summed minutes of their shifts.
- [ ] Full month / 1–15 / 16–end filter correctly; the label shows the range.
- [ ] A shift with a missing time shows the amber `0h` badge, the summary shows "need review", and the
      warning note appears.
- [ ] Tapping an employee filters the list; tapping again clears the filter.
- [ ] Copy produces one line per employee plus a total.
- [ ] Edit: the employee dropdown, the live duration, and Save disabled at 0 minutes; saving updates the
      totals.
- [ ] Delete removes the shift; a failure shows an alert and leaves the shift in place.
- [ ] Switching months quickly never shows another month's shifts.
- [ ] Phone width (375 px): `120h 30m` fits on one line; names aren't squeezed by badges.

**Timetable**
- [ ] Edit a day → Save. Demo: persists after reload. Live/staging: the `Timetable` tab updates.
- [ ] A failed save shows the red error and keeps the dialog open.

**Settings**
- [ ] Copy Backend Script copies the current `apps-script/Code.gs`.

## Post-deploy checks (after an Apps Script redeploy)
Read-only checks; these are safe on live:
- [ ] `GET ?action=getTimesheet&monthYear=<current MM-YYYY>` returns times as `HH:mm` strings, not ISO
      dates.
- [ ] `GET ?action=getTimesheet&monthYear=<a far-future month, e.g. 12-2099>` returns `[]`, and no tab
      appears in the sheet. (With the old backend this creates the tab; only run it after the redeploy.)
- [ ] `GET ?action=getEmployees` lists the staff.

Write checks (on **staging**, or on live only with the owner present and the entry deleted afterwards):
- [ ] Log a shift → the row appears in B–D or F–H and In/Out show as `HH:mm`.
- [ ] Log a different shift into the same slot → conflict modal; Overwrite → the sheet updates.
- [ ] Delete from the Timesheet tab → cells cleared.
- [ ] Roster save → `Timetable` tab updates and no "Copy of Template" tab appears.
- [ ] If `fixHoursFormulas` was run: E3 is `=IF(OR(C3="",D3=""),"",ROUND(MOD(D3-C3,1)*1440)/60)`, and a
      09:00–15:20 row shows `6.33`.

## Phase 0 evidence (2026-10-09, local)
- `npm run lint` and `npm run build` passed.
- **Hours checks (tsx):** 15 × 6h 20m → old logic 94.5 h, new 95h 0m. Edge cases: overnight
  (16:00–00:30 = 510 min), equal times, missing times, and an invalid string all give 0, plus the
  formatting cases.
- **Mock-sheet backend checks:**
  - `normalizeTime` cases.
  - GET for a missing month returns `[]` and creates no tab.
  - An invalid payload creates no tab.
  - First write creates the month tab; identical resubmit succeeds.
  - A different shift without `force` returns `conflict` and writes nothing; with `force` it writes.
  - The Evening slot maps to F–H.
  - Day 31 in September, an unknown shift, and missing times are rejected.
  - Delete clears the slot.
  - The roster writes, updates and ignores non-days.
  - `fixHoursFormulas` writes the expected formulas and skips non-month tabs.
- **Browser, demo mode, 375 px:**
  - Totals matched hand calculation (e.g. one employee 1,945 min = 32h 25m; total 120h 30m).
  - Pay-period switch, flagged shift, edit flow (38h 20m → 46h), copy text, zero-length block, and the
    conflict modal all worked; no console errors.
- **Not verified:** anything against the live or staging Apps Script after the redeploy.
