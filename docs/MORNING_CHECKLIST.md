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

## 3. Verify real totals against a copy of the sheet (Phase 0)
The new app computes each shift as whole minutes from In/Out and adds minutes. To check it against your
real data without touching the live sheet:
1. Open the **staging copy** from step 1 and pick a finished month tab, e.g. `09-2026`.
2. In an empty column to the right (e.g. `L`), put in `L3`:
   `=IF(OR(C3="",D3=""),"",MOD(ROUND((TIMEVALUE(TEXT(D3,"HH:mm"))-TIMEVALUE(TEXT(C3,"HH:mm")))*1440),1440))`.
   In `M3`, the same with `G3`/`H3`. Fill both down to row 33.
3. Per employee, in any cell: `=SUMIF(B3:B33,"<name>",L3:L33)+SUMIF(F3:F33,"<name>",M3:M33)`. This is
   the exact minutes for the month. For 1–15, use rows 3–17; for 16–end, rows 18–33.
4. Compare with the old app's monthly total for that person. Any difference is the old rounding error.
   Once the new backend runs against the staging copy (step 4 onwards), the new app's
   **Hours by Employee** must match the minutes exactly (minutes ÷ 60 = hours).
5. Phase 1B's `migrateSheets` adds these minute columns permanently, so you won't need the manual
   formulas afterwards.

_(Further steps are added below as phases are completed.)_
