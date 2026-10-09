# Progress

Newest session first. Update at the end of every session: what happened, current state, next step.

## Current state (end of session 2, 2026-10-09)
- **Branches:**
  - `main` = `c739064` (pre-Phase-0); this is what GitHub Pages serves.
  - `chore/project-docs` holds the docs commit (local only, not pushed).
- **Phase 0 code is uncommitted in the working tree** and carries across branch switches. Files:
  - modified: `src/components/{ConflictModal,MonthlyTimesheetTab,SettingsModal,ShiftLoggingTab,TimetableTab}.tsx`,
    `src/config.ts`, `src/services/api.ts`, `src/types.ts`
  - deleted (staged): `src/utils/appsScriptTemplate.ts`
  - new: `apps-script/Code.gs`, `src/utils/hours.ts`, `src/vite-env.d.ts`
  - untracked, not project code: `.claude/launch.json`
- **Deployed Apps Script:** assumed to be the owner's pre-Phase-0 version (as pasted on 2026-10-09) until
  the owner confirms a redeploy.
- **Next step:** the owner reviews these docs. Then commit Phase 0 on `phase-0-minute-hours` (from `main`
  after the docs branch merges, or stacked on `chore/project-docs`). The owner redeploys the Apps Script,
  then run the post-deploy checks and open the PR.
- **Phase 1 not started.** Wait for the owner's go-ahead.

## Session 2 (2026-10-09): Project memory
- Created `CLAUDE.md` and `docs/` (PROJECT, PLAN, DECISIONS, PROGRESS, QA) from the current code.
- Committed the docs on their own on `chore/project-docs`. No code changes.

## Session 1 (2026-10-09): Phase 0, minute-based hours
- **Problem:** monthly and 15-day totals were slightly off, which costs real money.
- **Root cause:** each shift was rounded to 0.1 h before being added up (D-001).
- **Changes:** see PLAN Phase 0 and DECISIONS D-001 to D-012. Other fixes found during the audit:
  - silent failed saves
  - invented default times
  - stale-cache overwrites
  - preselected employee name
  - roster save that never reached the sheet (and left "Copy of Template" tabs)
  - free-text name in edits
  - month browsing creating tabs
  - row-by-column-A parsing
- **Verified locally:** lint, build, hours checks, mock-sheet backend checks, browser demo mode
  (`QA.md` → Phase 0 evidence).
- **Live system contact:** one read-only `GET getTimesheet&monthYear=10-2026` to confirm the sheet layout.
  October was empty. With the old backend, this call creates the current month's tab if it's missing,
  which the app also does on every launch.
- Left uncommitted. The owner hasn't redeployed the Apps Script yet.
