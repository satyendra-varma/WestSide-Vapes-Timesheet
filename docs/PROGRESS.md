# Progress

Dated log, newest first. Updated with **every commit** (a session can end at any moment). Each entry:
Current phase / Done / Next step / Known problems.

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
