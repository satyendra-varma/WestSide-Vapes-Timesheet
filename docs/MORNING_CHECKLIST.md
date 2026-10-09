# Morning checklist (owner actions, in order)

Things only you can do: Claude can't deploy Apps Script, open your Sheet, or merge to `main`.
This file is updated after every phase; the latest `docs/PROGRESS.md` entry says what is finished.

## Status at a glance
- `main` (live site): untouched. It still runs the old app against the old Apps Script deployment, so
  it keeps working until you merge.
- `dev`: every finished phase, pushed to origin. Phase branches are pushed too, as backup.
- Nothing below happens automatically. Do the steps in order; each one says what it unblocks.

## 1. Back up the Sheet (before anything else)
1. Open the Google Sheet → **File → Version history → Name current version** (e.g. `before-v2`).
2. **File → Make a copy**, named `WestSide Timesheet (staging)`. You'll test the new backend on it
   before it touches the real sheet. Copying the spreadsheet copies its Apps Script project too.

## 2. Review the work
- Read the latest entry in `docs/PROGRESS.md` and the ticks in `docs/PLAN.md`.
- Optional, on your computer: `git switch dev`, `npm install`, `npm test`, `npm run build`.
- Optional, try the app with fake data, no Google needed: in one terminal run `npm run mock` (it prints
  demo names and PINs for that run), and in a second terminal run `npm run dev:mock`. Then open
  http://localhost:3000/WestSide-Vapes-Timesheet/.

## 3. Verify real totals against a copy of the sheet (Phase 0)
The new app computes each shift as whole minutes from In/Out and adds minutes. To check it against your
real data without touching the live sheet:
1. Open the **staging copy** and pick a finished month tab, e.g. `09-2026`.
2. In an empty column to the right (e.g. `L`), put in `L3`:
   `=IF(OR(C3="",D3=""),"",MOD(ROUND((TIMEVALUE(TEXT(D3,"HH:mm"))-TIMEVALUE(TEXT(C3,"HH:mm")))*1440),1440))`.
   In `M3`, the same with `G3`/`H3`. Fill both down to row 33.
3. Per employee: `=SUMIF(B3:B33,"<name>",L3:L33)+SUMIF(F3:F33,"<name>",M3:M33)` is the exact minutes for
   the month. For 1–15, use rows 3–17; for 16–end, rows 18–33.
4. Compare with the old app's total for that person. Any difference is the old rounding error. Once the
   new backend runs on the staging copy (step 4), the new app's **Hours by Employee** must match the
   minutes exactly (minutes ÷ 60 = hours).

## 4. Try the new (v2, login-protected) backend on the staging copy
1. In the staging copy, check the **Employees** tab lists your name in column A exactly as you'll type it.
2. **Extensions → Apps Script**. Replace everything in `Code.gs` with the contents of `apps-script/Code.gs`
   from the `dev` branch, then **Save**.
3. Set your manager PIN without ever writing it in code:
   - **Project Settings** (gear icon) → **Script properties** → **Add script property**:
     - `SETUP_MANAGER_NAME` = your name exactly as in the Employees tab
     - `SETUP_MANAGER_PIN` = a 6-digit PIN that isn't one repeated digit and isn't a run like 123456
   - Back in **Editor**, choose `setManagerPin` in the function drop-down → **Run** → approve the
     permissions prompt.
   - The execution log should say "Manager PIN set for …". Both SETUP properties are deleted
     automatically, even if it fails (then add them again and fix what the log says).
   - Your Employees tab now has `Role` and `Active` columns. Nothing existing was moved.
   - Then choose `migrateSheets` → **Run**. The log lists each month tab: `added`, `present`, or
     `skipped: <cell> already holds something else`. Skipped tabs were left completely untouched.
     Tell Claude about any skipped tab rather than moving your data.
   - Open a finished month tab and check:
     - J/K show whole minutes (e.g. 380 for 09:00–15:20);
     - M–Q list each person with minutes for 1–15, 16–end, month, and h:mm;
     - the numbers match step 3 and the new app's **Hours by Employee**.
   - If your own Hours columns (E/I) show `#VALUE!` on rows the new app writes, that's because In/Out
     are now plain text. Use the new J/K/M–Q totals, or change E/I to wrap times in `TIMEVALUE()`.
4. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone** →
   **Deploy**. Copy the URL ending in `/exec`. This is the *staging* URL.
5. Run the app on your computer against it. In PowerShell:
   `$env:VITE_APPS_SCRIPT_URL="<staging URL>"; npm run dev`, then open
   http://localhost:3000/WestSide-Vapes-Timesheet/.
6. Log in as yourself → **Settings (gear) → Staff & PINs** → set a test PIN for one staff member. Log a
   shift, edit it, check the Timesheet totals against step 3, then check the `Audit` tab in the staging
   sheet.

## 5. Deploy v2 for real (when step 4 looks right)
1. In the **real** Sheet: **Extensions → Apps Script** → paste the same `apps-script/Code.gs` → **Save**.
   - Saving does **not** change the existing deployment: it keeps serving the old code to the live app.
2. Set your manager PIN in the real project, exactly as in step 4.3, then run `migrateSheets` there
   too and read its log.
3. **Deploy → New deployment** (not "Manage deployments") → Web app, Me, Anyone → copy the **new**
   `/exec` URL. Keep the old deployment for now.
4. Set every staff member's PIN from the app (run it locally as in step 4.5, but with the *new real*
   URL). Tell each person their PIN in person.

## 6. Merge to the live site
1. On `dev`, open `src/config.ts` and set `APPS_SCRIPT_URL` to the **new real** URL from step 5.3.
   Commit that one-line change. Never use the old URL: the new app refuses it anyway.
2. Open a pull request `dev` → `main` on GitHub and merge it. Your existing GitHub Pages workflow deploys
   it.
3. On a phone, open the live site, log in, and check the Timesheet shows the month correctly.
4. Then archive the old deployment: Apps Script → **Deploy → Manage deployments** → the old one →
   **Archive**. Staff with the old page open will get errors until they reload.

## 7. CI and deploy wiring (Phase 3, optional but recommended)
- GitHub → **Actions**: the new **CI** workflow runs on every push. Check it's green on `dev` before
  you merge.
- Your existing `deploy.yml` (deploy on push to `main`) was **not changed**. It runs `npm install` and
  `npm run build` but no tests. If you want, add `npm ci` and `npm test` before its build step, or, in
  repo **Settings → Branches**, protect `main` and require the **CI / check** status to pass before
  merging.

## 8. Install the app on the shop device (after step 6)
- **Android/Chrome:** open the live site → menu → **Install app** (or **Add to Home screen**).
- **iPhone/Safari:** Share → **Add to Home Screen**.
- If a shift is logged while the shop Wi-Fi is down, it shows under **Not sent yet** and is sent
  automatically when the connection returns. Staff should stay logged in until that list is empty;
  logging out asks first.

_(Later phases add steps below.)_
