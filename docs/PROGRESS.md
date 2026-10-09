# Progress

Dated log, newest first. Updated with **every commit** (a session can end at any moment). Each entry:
Current phase / Done / Next step / Known problems.

## 2026-10-09: Phase 3 complete (tests + CI)
- **Current phase:** 3 → merged into `dev`; next is Phase 2 (payroll views).
- **Done:**
  - `ci.yml` (checks only, every branch).
  - `strict: true`.
  - Backend util tests and code-rule tests (121 total).
  - Removed 7 unused dependencies; refreshed `.env.example`.
  - D-036; MORNING_CHECKLIST step 7 for deploy wiring.
- **Next step:** Phase 2 on `phase/2-payroll-views`:
  - per-employee summary table with h:mm, decimal and needs-review (exists; refine into a table);
  - manager-only CSV export (summary + daily rows) with formula-injection guard;
  - check that "6h 20m" is shown everywhere.
- **Known problems:**
  - CI hasn't been observed on GitHub yet; the first push of this branch triggers it.

## 2026-10-09: Phase 1B complete (backend hardening)
- **Current phase:** 1B → merged into `dev`; next is Phase 3 (tests + CI).
- **Done:**
  - In/Out stored as plain text.
  - Additive minute columns J/K and minute totals M–Q (`09_month_formulas.js`), added to new month tabs
    automatically.
  - Owner-run `migrateSheets()` for the Template and existing tabs: additive, idempotent, skips
    occupied tabs.
  - 8 new tests (89 total). Docs: PROJECT layout + migration note, MORNING_CHECKLIST steps 4–5, QA
    staging checks, D-035.
- **Next step:** Phase 3 on `phase/3-tests-ci`:
  - GitHub Actions CI (install, typecheck, build, test on push/PR to any branch; no deploy changes);
  - `strict: true` in tsconfig with fixes, no `any`;
  - remove unused dependencies;
  - `npm ci` in CI.
- **Known problems:**
  - The sheet formulas are verified only as strings; the owner must check them on the staging copy.
  - The owner's own E/I formulas may not accept text times (documented).

## 2026-10-09: Phase 1A complete (authentication)
- **Current phase:** 1A → merged into `dev`; next is 1B (backend hardening).
- **Done:**
  - Backend rewritten as `apps-script/src/*.js` → generated `Code.gs`: PIN login, signed tokens,
    roles, active flag, lockout, Audit tab, manager staff actions, server-side validation, staff
    restricted to their own shifts.
  - Node fakes + vm loader + `npm run mock` HTTP mock backend.
  - Frontend: login gate, sessionStorage token, in-memory data store, re-login overlay that keeps
    forms, role-gated UI, manager Settings with Staff & PINs, accessible Modal.
  - Removed the v1 API client and the legacy HTML export.
  - 81 tests pass.
  - Browser walkthrough against the mock backend: see QA.md evidence.
  - Decisions D-023 to D-034.
- **Next step:** Phase 1B on `phase/1b-backend-hardening`:
  - plain-text In/Out (`@` format) and reading Dates via `Utilities.formatDate`;
  - integer-minute columns J/K + per-employee summary formulas, plus a `migrateSheets()` owner
    function with a migration note;
  - rename-safe validation is already in place (employee exists + active).
- **Known problems:**
  - Delete still uses `window.confirm` (in-app dialog in Phase 5).
  - A network error during save says "not saved" (offline queue in Phase 5).
  - The owner must do MORNING_CHECKLIST steps 1–6 before v2 can go live.

## 2026-10-09: Phase 0 complete (minute-based hours)
- **Current phase:** 0 → merged into `dev`; next is 1A.
- **Audit results:**
  - `tsc --noEmit`: 0 errors. `npm run build`: OK.
  - Hours math outside `hours.ts`: the 12-hour warning (`12 * 60` in ShiftLoggingTab) and
    `fixHoursFormulas` (decimal sheet formulas). Both are fixed.
  - `githubPagesExport.ts` has no hours math.
  - The `calculateShiftHours` / `totalHours` breakage was already fixed in the session-1 working tree.
- **Done:**
  - Committed the session-1 minute-based code.
  - Added `LONG_SHIFT_MINUTES` and `needsReview` to `hours.ts`, plus NaN guards.
  - New `periods.ts` for pay periods.
  - Vitest with 16 tests: formatting, 31 × 6h20m = 196h 20m, a regression test proving the old logic
    lost 62 min, overnight, invalid times, per-employee totals, semi-monthly split, Settings export
    drift.
  - `INITIAL_EMPLOYEES` emptied (no real names).
  - `appsScriptTemplate.ts` restored as a `?raw` re-export.
  - `fixHoursFormulas` removed (D-021). `package-lock.json` committed.
- **Next step:** Phase 1A on `phase/1a-auth`: split the backend into `apps-script/src/*.js` with a
  generated `Code.gs`, build the Node fakes + mock server, add auth, then the frontend login gate.
- **Known problems:**
  - `@types/react` is missing, so components are effectively untyped (Phase 3 adds it and strict mode).
  - The live app is unchanged until the owner merges.

## 2026-10-09: Project memory for the unattended run
- **Current phase:** setup (`phase/docs-memory`), before Phase 0.
- **Done:**
  - Created the `dev` integration branch from `main` + the earlier docs commit (`6f0bacd`) and pushed
    it to origin.
  - Rewrote `CLAUDE.md` for the unattended workflow (D-019).
  - `PLAN.md` now lists phases 0, 1A, 1B, 3, 2, 4, 5, 6, 7, 8.
  - Added D-014 to D-020 (no pay calculation, integer cents, customer-data handling, email-only
    reminders, PIN + signed-token auth, workflow, new-deployment rollout).
  - Added `MORNING_CHECKLIST.md`.
  - Removed real employee names from `QA.md`.
- **Next step:** Phase 0 on `phase/0-minute-hours`: commit the minute-based hours code that is
  uncommitted in the working tree (from session 1), add Vitest and the required tests, remove real
  names from `INITIAL_EMPLOYEES`, restore `appsScriptTemplate.ts` as a generated re-export.
- **Known problems:**
  - `CLAUDE.md` already refers to `npm test`, `npm run build:gas` and `npm run mock`; they arrive in
    Phase 0 and 1A.
  - The live app still has the rounding bug until the owner merges.

## 2026-10-09: Session 2, project memory (interactive)
- Created `CLAUDE.md` and `docs/` on `chore/project-docs` (`6f0bacd`), docs only.

## 2026-10-09: Session 1, Phase 0 implementation (interactive)
- **Root cause:** each shift was rounded to 0.1 h before being added up (D-001). 15 × 6h 20m showed
  94.5 h instead of 95 h.
- Implemented minute-based hours, pay-period summary and the Phase 0 backend fixes (D-001 to D-012).
  Verified locally only; left uncommitted.
- **Live system contact:** one read-only `getTimesheet` for `10-2026` to confirm the sheet layout.
