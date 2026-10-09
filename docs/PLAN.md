# Plan

`[x]` done and verified · `[ ]` to do · **(owner)** needs the shop owner · **(confirm)** needs a business
decision before building. Each phase gets its own branch (`phase-<n>-<slug>`); see `CLAUDE.md`.

## Phase 0: Minute-based hours
**Status: implemented and verified locally. Not yet committed, deployed or verified live.**
Branch: `phase-0-minute-hours` (to be created; the code is uncommitted in the working tree).

- [x] Durations stored and added up as integer minutes (`src/utils/hours.ts`); removed the rounded
      `totalHours` field and `calculateShiftHours`
- [x] Hours shown as `6h 20m` plus `6.33 h`, derived only from minute totals
- [x] Timesheet: pay periods (Full month / 1–15 / 16–end), Hours by Employee, Copy summary
- [x] Missing or zero-length times count as 0 and are flagged; no more invented default times
- [x] Failed saves, deletes and roster saves are reported as failures, not "saved locally"
- [x] Backend: server-side conflict check with `force`, input validation, read-only GET, display-value
      times, working `updateTimetable`, `fixHoursFormulas` helper
- [x] Log Shift: no preselected name (cleared after submit), 0-length block, overnight / over-12-hour
      warning. Edit modal uses an employee dropdown.
- [x] Local verification: lint + build, hours unit checks, mock-sheet backend checks, browser demo-mode
      walkthrough (`QA.md` → Phase 0 evidence)
- [ ] Commit the Phase 0 code on `phase-0-minute-hours`, push, open a PR
- [ ] **(owner)** Redeploy the Apps Script as a new version of the existing deployment
- [ ] **(owner, optional)** Run `fixHoursFormulas` once; spot-check one month tab
- [ ] Post-deploy checks on a staging copy, or read-only on live (`QA.md`)
- [ ] **(owner)** Merge the PR into `main` (deploys to GitHub Pages)

## Phase 1: Backend hardening
- [ ] Write protection: shared shop PIN/token checked by `doPost` (the URL is public in the repo and bundle)
- [ ] Reject names not in `Employees`; neutralise formula injection (values starting with `= + - @`)
- [ ] `action=version` endpoint; the app warns when the deployed backend is older than it expects
- [ ] Legacy standalone HTML export: fix its contract or remove it **(confirm)**
- [ ] Structured validation errors (field + message) the UI can show
- [ ] Keep the deployed script in sync with `apps-script/Code.gs` (clasp, or a documented checklist)
- [ ] Log failed writes (Apps Script logging); the full audit log is Phase 5

## Phase 2: Payroll views
- [x] Semi-monthly totals per employee + copy summary (shipped with Phase 0)
- [ ] Per-employee period timesheet (daily lines + total) that prints cleanly
- [ ] CSV export of a pay period for the payroll provider
- [ ] Overtime flags, e.g. BC ESA daily/weekly thresholds **(confirm)**
- [ ] Pay period type: semi-monthly vs bi-weekly **(confirm)**
- [ ] Period lock / "approved" marker so closed periods can't be changed silently
- [ ] Hourly rates + pay estimate, manager-only (depends on Phase 4 roles) **(confirm)**

## Phase 3: Tests + CI
- [ ] Vitest + `npm test`: unit tests for `hours.ts` and `api.ts` (time parsing, row → record mapping,
      response handling)
- [ ] Commit the Node `vm` mock-Sheet harness for `Code.gs` (save, conflict, force, delete, validation,
      roster, `fixHoursFormulas`)
- [ ] Commit `package-lock.json`; CI switches to `npm ci`
- [ ] PR workflow: lint + test + build on every PR (deploy workflow stays main-only)
- [ ] **(owner)** Branch protection on `main`: require a PR and passing checks
- [ ] Remove unused deps (`@google/genai`, `express`, `dotenv`, `motion`, `@types/express`) and AI Studio
      leftovers (`.env.example`, `metadata.json`, README boilerplate)

## Phase 4: Data completeness (edit/delete shifts, persistent timetable, roles)
- [x] Edit (name/times) and delete a shift slot from the Timesheet tab; failures are reported
      (verified in demo mode only)
- [ ] Move a shift to another date or slot (today: delete + log again)
- [ ] Persistent timetable: `updateTimetable` is written; verify live after the redeploy
- [ ] Week-specific rosters and more than one person per shift **(confirm)**
- [ ] Roles: staff (log shifts) vs manager (edit/delete, roster, payroll), manager PIN
- [ ] Manage employees in the app (add/deactivate) instead of editing the sheet
- [ ] Normalise employee names so variants don't split totals

## Phase 5: Reliability + polish (offline queue, PWA, audit log)
- [ ] Offline queue: failed submits kept as "pending", retried, clearly shown until confirmed
- [ ] PWA: manifest, icons, service worker, installable on the shop device
- [ ] Audit log tab: every write (time, action, slot, old → new values)
- [ ] Header Live/Demo pill reflects the real connection state
- [ ] Replace `alert()`/`confirm()` with in-app dialogs; friendlier date display
- [ ] Rewrite README for this project
