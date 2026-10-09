# WestSide Vapes Timesheet: instructions for Claude

Staff shift logging, monthly timesheets and weekly roster for WestSide Vapes (Kerrisdale).
React app on GitHub Pages; data lives in a Google Sheet behind an Apps Script web app.
These hours become wages, so accuracy comes before convenience.

## Start of every session
Read these before doing anything else:
1. `docs/PROGRESS.md`: where the last session stopped and what's next
2. `docs/PLAN.md`: phases and the current phase's checklist
3. `docs/DECISIONS.md`: decisions already made (don't relitigate them without a reason)
4. `docs/PROJECT.md`: architecture, file map, sheet layout, Apps Script contract, redeploy steps
5. `docs/QA.md`: how to verify changes safely

## Rules
1. **One phase per branch.** Branch from `main` as `phase-<n>-<slug>` (e.g. `phase-1-backend-hardening`).
   Docs/chores go on `chore/<slug>`. Never mix two phases on one branch.
2. **Audit first, edit after approval.** Before changing code, read the relevant code and report the
   findings plus a proposed change list. Wait for the owner's explicit OK before editing.
3. **Build + tests before every commit.** `npm run lint` and `npm run build` must pass, plus `npm test`
   once it exists (Phase 3), plus the relevant manual checks in `docs/QA.md`. Never commit on a failing
   check; report the failure with its output.
4. **Never push to `main` directly.** A push to `main` deploys to GitHub Pages. Push the phase branch and
   open a PR; the owner merges.
5. **Never write test data to the live sheet.** Use demo mode or a staging copy (`docs/QA.md`).
6. **Durations are integer minutes** (`src/utils/hours.ts`). Never store or add up rounded hours; convert
   to hours only for display (DECISIONS D-001).
7. **`apps-script/Code.gs` is the backend source of truth.** Any change needs the owner to redeploy
   (`docs/PROJECT.md` → Redeploy). Keep the frontend working with the backend that is currently deployed.
8. **End of every session:** update `docs/PROGRESS.md` (what happened, current state, next step),
   tick `docs/PLAN.md`, and record new decisions in `docs/DECISIONS.md`.

## Commands
- `npm install`
- `npm run dev` → http://localhost:3000/WestSide-Vapes-Timesheet/
- `npm run lint` (TypeScript check)
- `npm run build`
