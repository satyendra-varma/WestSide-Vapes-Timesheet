# Morning checklist (owner actions, in order)

Things only you can do: Claude can't deploy Apps Script, open your Sheet, or merge to `main`.
Each step lists the phase it unblocks. This file is updated after every phase; see the latest
`docs/PROGRESS.md` entry for what is finished.

## Status at a glance
- `main` (live site): untouched.
- `dev`: integration branch with all finished phases, pushed to origin.
- The live app keeps using the old Apps Script deployment until you merge.

## 1. Back up the Sheet (before anything else)
1. Open the Google Sheet → **File → Version history → Name current version** (e.g. `before-v2`).
2. Also **File → Make a copy** and name it `WestSide Timesheet (staging)`. You'll use it to test the
   new backend before it touches the real sheet.

## 2. Review the work
- Read `docs/PROGRESS.md` (latest entry) and `docs/PLAN.md`.
- Optional: `git switch dev && npm install && npm test && npm run build`.

_(Further steps are added below as phases are completed.)_
