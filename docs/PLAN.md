# Plan

`[x]` done (built + tested) · `[ ]` to do · **(owner)** only the owner can do it (see `MORNING_CHECKLIST.md`).

Execution order: **0 → 1A → 1B → 3 → 2 → 4 → 5 → 6 → 7 → 8.** Each phase is on `phase/<id>-<name>`,
cut from `dev` and merged back into `dev` when it's green. `main` is never touched by Claude.

## Phase 0: Minute-based hours (`phase/0-minute-hours`)
- [x] Audit: run build + `tsc --noEmit`; list every place hours are calculated, rounded or summed
      (results in PROGRESS 2026-10-09 Phase 0)
- [x] `src/utils/hours.ts` is the single source of truth (integer minutes, formatted once); no other
      hours math anywhere (components, api, export, Apps Script, mock data)
- [x] Display `6h 20m` everywhere, with the decimal (`6.33`) secondary
- [x] Edge cases: overnight, identical in/out = 0 flagged "needs review", missing/invalid times flagged,
      never NaN
- [x] Vitest set up; tests: 380 min → `6h 20m`/`6.33`; 31 × 6h20m = exactly 196h 20m; overnight;
      invalid; per-employee totals; semi-monthly split; regression test proving round-then-sum was wrong
- [x] Real employee names removed from shipped data (`INITIAL_EMPLOYEES`)
- [x] `appsScriptTemplate.ts` restored as a generated `?raw` re-export of the backend + drift test
- [ ] **(owner)** Verify real totals against a copy of the sheet (MORNING_CHECKLIST)

## Phase 1A: Authentication (`phase/1a-auth`)
Audit (2026-10-09): every v1 endpoint was open and the URL was public; the frontend prefetched and cached
all data in localStorage; Settings let anyone change the URL and copy the backend; the standalone HTML
export used a broken contract.
- [x] Backend split into `apps-script/src/*.js`; `Code.gs` generated (`npm run build:gas`) + drift test
- [x] Node test harness: fake SpreadsheetApp/PropertiesService/LockService/Utilities/ContentService (D-025)
- [x] All actions are POST `{action, token, …}` (text/plain); `doGet` only reports `apiVersion` (D-026)
- [x] `login` (name + 6-digit PIN) is the only unauthenticated action
- [x] PINs stored as salted + peppered hashes in Script Properties; never in the Sheet, repo or logs
- [x] One-time `setManagerPin` (temporary Script Properties, always deleted); manager-only `setPin`
- [x] HMAC-SHA256 signed token {name, role, version, exp}; secret in Script Properties; constant-time
      compare; staff 8 h, manager 2 h
- [x] Roles manager/staff; active flag + token version checked on every request
- [x] Lockout: 5 failures → 15 min; manager unlock; auth events in the Audit sheet (no PINs/tokens)
- [x] Manager-only: Settings, Code.gs export, URL editor, roster edits, PIN set/reset/unlock,
      (de)activate, delete shift
- [x] Frontend: login gate; no data fetch or storage before login; logout/expiry wipes cached data;
      expired-token re-login without losing unsaved forms
- [x] Removed the legacy standalone HTML export (D-031)
- [x] Mock backend server running the real `Code.gs` (`npm run mock`, `npm run dev:mock`); fake names
- [x] Tests: sign/verify, expiry, tampering, lockout, roles, deactivated users, no data without a token
      (81 tests total)
- [x] Rollout documented: NEW deployment + NEW URL; config URL set only at merge; old deployment
      archived after (MORNING_CHECKLIST steps 4–6)
- [ ] **(owner)** Sheet backup, staging test, new deployment, manager PIN, staff PINs (MORNING_CHECKLIST)

## Phase 1B: Backend hardening (`phase/1b-backend-hardening`)
Audit (2026-10-09): conflict detection inside the lock, `forceOverwrite`, and validation (month, date,
shift, HH:mm, active employee) already landed with 1A. Missing: text storage and minute columns.
- [x] IN/OUT written as plain text `HH:mm` (format `@`); reads handle text, numbers and Dates
      (`Utilities.formatDate`, spreadsheet time zone: D-027)
- [x] Integer-minute duration columns J/K by formula (past-midnight safe) + per-employee/half-month/month
      totals M–Q that sum minutes and show h:mm; no decimal hours; additive + migration note (D-035)
- [x] `migrateSheets()` owner function: additive, idempotent, skips occupied tabs; new month tabs get
      the columns on creation
- [x] Server-side conflict detection inside the lock; `forceOverwrite` honoured (done in 1A, retested)
- [x] Validation: monthYear, real date not in the future, shift enum, HH:mm, not zero-length, employee
      exists and is active (done in 1A)
- [x] Tests: `tests/backend/hardening.test.ts` (89 tests total)
- [ ] **(owner)** Run `migrateSheets` on the staging copy, verify the formulas, then on the real sheet
      (MORNING_CHECKLIST steps 4–5)

## Phase 3: Tests + CI (`phase/3-tests-ci`)
- [ ] Vitest across hours, auth, validation, conflict, API client against the mock backend
- [ ] Strict TypeScript; no `any` in new code
- [ ] GitHub Actions: on push + PR to any branch: install, typecheck, build, test (no deploy changes)
- [ ] Lockfile committed (done in Phase 0), CI uses `npm ci`
- [ ] **(owner)** Wire deploy-on-main yourself if wanted; optionally protect `main`

## Phase 2: Payroll views, no money (`phase/2-payroll-views`)
- [ ] Per-employee summary table: shifts, total h:mm, decimal, needs-review count; period toggle full /
      1–15 / 16–end
- [ ] Manager-only CSV export (summary + daily rows) with formula-injection guard (`= + - @` prefixed)
- [ ] Shift hours `6h 20m` with decimal secondary

## Phase 4: Data completeness (`phase/4-data-completeness`)
- [ ] Edit shift (server-validated); delete manager-only; every change audited (who, when, old → new)
- [ ] Roster persisted to the Sheet, manager-only edits, all devices read the same roster

## Phase 5: Reliability + polish (`phase/5-reliability-polish`)
- [ ] Offline queue for shift logs only: queued/failed states, retry, no silent loss; warn + clear on
      logout
- [ ] Installable PWA; service worker caches same-origin static assets only (never API, never customer
      data)
- [ ] Loading/error/offline states; accessibility (labels, 44 px targets, modal focus, contrast)
- [ ] Shop name + API URL in config; refresh event name as a constant
- [ ] Audit log complete and viewable by the manager

## Phase 6: Stock list + customer requests (`phase/6-stock-requests`)
- [ ] Stock list: product, low|out, noted by, date, resolved tick
- [ ] Customer requests: name, phone (validated), product, date, open|contacted|fulfilled; privacy line;
      tel: links; grouped by product; product autocomplete
- [ ] Manager-only: delete, purge period, export. Customer data in React state only; never in
      errors or audit text.
- [ ] Time-driven purge of fulfilled requests after N days, logged by count only
- [ ] **(owner)** Install triggers (MORNING_CHECKLIST)

## Phase 7: End-of-day cash count (`phase/7-cash-count`)
- [ ] Canadian denominations, live total in integer cents, configurable target float, difference
- [ ] One count per day; edits audited; manager sees history, staff adds today's

## Phase 8: Reminders, email only (`phase/8-reminders`)
- [ ] Time-driven trigger: roster vs logged shifts; email after grace period; reminder log prevents
      duplicates; honour active flag
- [ ] Email column in Employees (additive, migration note)
- [ ] **(owner)** Install trigger, add emails, enable reminders (MORNING_CHECKLIST)
