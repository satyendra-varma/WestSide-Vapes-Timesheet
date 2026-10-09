# Morning checklist (owner actions, in order)

Things only you can do: Claude can't deploy Apps Script, open your Sheet, or merge to `main`.
The latest entry in `docs/PROGRESS.md` says what's finished.

## Status at a glance
- **All phases (0, 1A, 1B, 3, 2, 4, 5, 6, 7, 8) are on `dev`**, merged, pushed, and CI-tested on GitHub.
- `main` (live site) is untouched. It still runs the old app against the old Apps Script deployment, so
  it keeps working until you merge.
- Nothing below happens automatically. Do the steps in order; each says what it unblocks. Steps 1–6
  get v2 live; 7–10 are follow-ups.

## 1. Back up the Sheet (before anything else)
1. Open the Google Sheet → **File → Version history → Name current version** (e.g. `before-v2`).
2. **File → Make a copy**, named `WestSide Timesheet (staging)`. You'll test the new backend on it
   before it touches the real sheet. Copying the spreadsheet copies its Apps Script project too.

## 2. Review the work (optional but recommended)
- Read the latest entry in `docs/PROGRESS.md` and the ticks in `docs/PLAN.md`.
- On your computer: `git switch dev`, `npm install`, `npm test`, `npm run build`.
- Try the whole app with fake data, no Google needed: run `npm run mock` in one terminal (it prints demo
  names and PINs for that run) and `npm run dev:mock` in a second. Then open
  http://localhost:3000/WestSide-Vapes-Timesheet/.

## 3. Verify real totals against a copy of the sheet (Phase 0)
The new app computes each shift as whole minutes from In/Out and adds minutes. To check it against your
real data:
1. Open the **staging copy** and pick a finished month tab, e.g. `09-2026`.
2. After step 4.3 below (`migrateSheets`), columns J/K show each shift's minutes and M–Q show each
   person's totals (1–15, 16–end, month, h:mm).
   - Before that, you can do it by hand: in `L3` put
     `=IF(OR(C3="",D3=""),"",MOD(ROUND((TIMEVALUE(TEXT(D3,"HH:mm"))-TIMEVALUE(TEXT(C3,"HH:mm")))*1440),1440))`.
   - In `M3`, the same with `G3`/`H3`. Fill both down to row 33.
   - Per employee, `=SUMIF(B3:B33,"<name>",L3:L33)+SUMIF(F3:F33,"<name>",M3:M33)` gives the month's
     minutes.
3. Compare with the old app's total for that person: any difference is the old rounding error. The new
   app's **Hours by Employee** must match the minutes exactly (minutes ÷ 60 = hours).

## 4. Try the new (v2, login-protected) backend on the staging copy
1. In the staging copy, check the **Employees** tab lists your name in column A exactly as you'll type it
   at login.
2. **Extensions → Apps Script**. Replace everything in `Code.gs` with the contents of `apps-script/Code.gs`
   from the `dev` branch, then **Save**.
3. One-time setup functions (pick each in the function drop-down, then **Run**; approve the permission
   prompts the first time):
   - **Manager PIN, never written in code.** In **Project Settings** (gear icon) → **Script
     properties** → **Add script property**:
     - `SETUP_MANAGER_NAME` = your name exactly as in the Employees tab
     - `SETUP_MANAGER_PIN` = 6 digits, not one repeated digit, not a run like 123456

     Then run `setManagerPin`. The log should say "Manager PIN set for …". Both SETUP properties are
     deleted automatically, even if it fails (then add them again and fix what the log says).
   - **Run `migrateSheets`.**
     - It adds minute columns J/K and totals M–Q to the Template and every month tab, and `Active` /
       `Role` / `Email` headers to the Employees tab. Nothing existing is moved or changed.
     - The log lists each tab as `added`, `present`, or `skipped: <cell> already holds something else`.
       Skipped tabs were left completely untouched; tell Claude rather than moving your data.
     - Open a finished month tab: J/K show minutes (380 for 09:00–15:20) and M–Q the per-person
       totals.
     - If your own Hours columns (E/I) show `#VALUE!` on rows the new app writes, that's because
       In/Out are now plain text. Use J–Q, or wrap E/I's time references in `TIMEVALUE()`.
   - **Run `installTriggers`.** It creates a daily job (deletes fulfilled customer requests after the
     purge period) and an hourly job (shift-reminder emails, which do nothing until you enable them in
     the app). Approve the "send email as you" permission. Re-running is safe.
4. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone** →
   **Deploy**. Copy the URL ending in `/exec`: this is the *staging* URL.
5. Run the app on your computer against it (PowerShell):
   `$env:VITE_APPS_SCRIPT_URL="<staging URL>"; npm run dev`, then open
   http://localhost:3000/WestSide-Vapes-Timesheet/.
6. Log in as yourself and test:
   - **Settings (gear) → Staff & PINs:** set a test PIN for one staff member.
   - Log a shift, edit it, check the Timesheet totals against step 3.
   - Add a stock item and a test customer request (use a made-up name and number), then delete the
     request.
   - Save a cash count.
   - Check the `Audit`, `Stock`, `Requests` and `CashCounts` tabs in the staging sheet.

## 5. Deploy v2 for real (when step 4 looks right)
1. In the **real** Sheet: **Extensions → Apps Script** → paste the same `apps-script/Code.gs` → **Save**.
   Saving does **not** change the existing deployment; it keeps serving the old code to the live app.
2. Run the three setup functions in the real project exactly as in step 4.3: `setManagerPin` (with the
   SETUP properties), `migrateSheets`, `installTriggers`.
3. **Deploy → New deployment** (not "Manage deployments") → Web app, Me, Anyone → copy the **new**
   `/exec` URL. Keep the old deployment for now.
4. Set every staff member's PIN from the app (run it locally as in step 4.5, but with the *new real*
   URL). Tell each person their PIN in person.

## 6. Merge to the live site
1. On `dev`, open `src/config.ts` and set `APPS_SCRIPT_URL` to the **new real** URL from step 5.3.
   Commit and push that one-line change. Never use the old URL; the new app refuses it anyway.
2. On GitHub, check the **CI** workflow is green on `dev`. Then open a pull request `dev` → `main` and
   merge it. Your existing GitHub Pages workflow deploys it.
3. On a phone, open the live site, log in, and check the Timesheet shows the month correctly.
4. Archive the old deployment: Apps Script → **Deploy → Manage deployments** → the old one →
   **Archive**. Anyone with the old page open gets errors until they reload.

## 7. Shift reminder emails (Phase 8, when you want them)
1. In the **Employees** tab, fill the **Email** column for each staff member who should get reminders.
2. In the app: **Settings → Shift reminders (email)** → tick **Send reminder emails**, set the grace
   period (default 60 minutes after the shift ends) → **Save**.
3. The panel warns if the hourly job isn't installed (step 5.2) or if rostered staff have no email.
4. Each unlogged rostered shift gets at most one email; the `Reminders` tab lists every email sent.
   Emails come from your Google account (MailApp's daily quota applies; about 100 a day on a free
   account).

## 8. Install the app on the shop device
- **Android/Chrome:** open the live site → menu → **Install app** (or **Add to Home screen**).
- **iPhone/Safari:** Share → **Add to Home Screen**.
- If a shift is logged while the shop Wi-Fi is down, it shows under **Not sent yet** and is sent
  automatically when the connection returns. Staff should stay logged in until that list is empty;
  logging out asks first.

## 9. Set the cash float
In the app: **Cash** tab → **Target float ($)** → e.g. `200` → **Save float**. Each day's count keeps
the float that applied when it was first counted.

## 10. CI and deploy wiring (optional)
- Your existing `deploy.yml` (deploy on push to `main`) was **not changed**. It runs `npm install` and
  `npm run build` but no tests.
- If you want, add `npm ci` and `npm test` before its build step, or, in repo **Settings → Branches**,
  protect `main` and require the **CI / check** status to pass before merging.
