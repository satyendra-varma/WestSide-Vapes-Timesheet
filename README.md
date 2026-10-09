# WestSide Vapes Timesheet

A mobile-first web app for staff at WestSide Vapes (Kerrisdale):
- **Shifts:** log shifts and see monthly timesheets with exact hours (integer minutes, no rounding drift)
  and pay-period totals.
- **Roster:** the weekly schedule.
- **Stock & requests:** low/out-of-stock list and customer requests.
- **Cash:** end-of-day cash count.
- **Reminders:** email when a rostered shift wasn't logged.

It's a React + Vite + Tailwind app on GitHub Pages. Data lives in a Google Sheet behind a
login-protected Google Apps Script web app. It's installable as a PWA, and shift logs made offline are
queued and sent later.

## Quick start (no Google account needed)

```bash
npm install
npm run mock       # terminal 1: local mock backend with fake data; prints demo logins
npm run dev:mock   # terminal 2: the app, pointed at the mock backend
```

Open http://localhost:3000/WestSide-Vapes-Timesheet/ and log in with a name and PIN printed by
`npm run mock`.

## Checks

```bash
npm run lint        # strict TypeScript
npm test            # Vitest: hours, auth, backend (real Code.gs on fake Google services), client, PWA, rules
npm run build
npm run build:gas   # regenerate apps-script/Code.gs after editing apps-script/src/*.js
```

CI (`.github/workflows/ci.yml`) runs these on every push and pull request.

## Documentation
- `CLAUDE.md`: working rules for this repo.
- `docs/PROJECT.md`: architecture, files, sheet layout, backend API contract, migration notes.
- `docs/DECISIONS.md`: why things are the way they are.
- `docs/PLAN.md` and `docs/PROGRESS.md`: what's done and what's next.
- `docs/QA.md`: test suites and manual checklists.
- `docs/MORNING_CHECKLIST.md`: **owner steps to deploy the backend and go live**.

## Deploying
1. The backend (`apps-script/Code.gs`) is pasted into the Sheet's Apps Script editor and deployed as a
   web app.
2. The app's `APPS_SCRIPT_URL` (`src/config.ts`) is set to that deployment's URL.
3. Pushing to `main` publishes to GitHub Pages.

See `docs/MORNING_CHECKLIST.md` for the exact, safe order.
