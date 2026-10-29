# AJT Scoreboard — run it all on Vercel (no install, browser only)

Your website is already on Vercel + GitHub, so this uses the same two accounts. The scoreboard becomes its **own small Vercel project** (your main site is untouched). The TV, umpire phones, control center and guest page are all web pages; the scores are saved in your existing Supabase project. Your work laptop only needs a browser.

**Takes about 30 minutes. Do it today, rehearse tomorrow.**

> Trade-off: this version needs internet at the venue (phones on mobile data are fine). If it drops, scoring pauses until it returns; nothing already saved is lost.

## 1. Private table in Supabase (2 min)
1. Supabase project → **SQL Editor → New query** → paste all of `supabase.sql` → **Run**.
2. **Project Settings → API**: copy the **Project URL** and the **secret / service_role key** (keep it private).

## 2. Put the files on GitHub (5 min, in the browser)
1. github.com → **New repository** → `ajt-scoreboard` → **Private** → Create.
2. **uploading an existing file** → drag in everything inside this folder (`api` folder, `public` folder, `package.json`, `vercel.json`, `supabase.sql`) → **Commit changes**.
3. Check the repo shows `api/[...path].js` and `public/tv.html`.

## 3. Create the Vercel project (5 min)
1. vercel.com → **Add New… → Project** → import `ajt-scoreboard` from GitHub.
2. **Framework Preset: Other.** Leave Build Command empty. (Output directory `public` is read from `vercel.json`.)
3. Open **Environment Variables** and add (all environments):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL from step 1 |
| `SUPABASE_SERVICE_KEY` | the secret key from step 1 |
| `CONTROL_PIN` | PIN only you know, e.g. `7391` |
| `UMPIRE_PIN` | a different PIN for the two umpires, e.g. `2468` |
| `VIEW_CODE` | guest access code, e.g. `spooky31` (6+ characters) |

4. **Deploy.** (If you add or change variables later: **Deployments → ⋯ → Redeploy**.)
5. Optional: **Settings → Domains** → add `scores.ajttennisclub.com`. Because your domain is already on Vercel it usually configures itself. Otherwise use the free `something.vercel.app` address.

## 4. Your links
Replace `SITE` with your address and `CODE` with the VIEW_CODE:

| Who | Link |
|---|---|
| **Guests** (QR code / button on your site) | `https://SITE/live?code=CODE` |
| **TV** | `https://SITE/tv?code=CODE` (press **F** for fullscreen) |
| **Umpire, Court 1** | `https://SITE/umpire?court=1&code=CODE` |
| **Umpire, Court 2** | `https://SITE/umpire?court=2&code=CODE` |
| **Control center** (work laptop) | `https://SITE/control?code=CODE` |

- First tap on a phone asks for a PIN: umpires use the **UMPIRE_PIN**, you use the **CONTROL_PIN**. It's remembered after that.
- The code disappears from the address bar after the first visit.
- On your main website, add a normal button/link to the guest link. Don't embed it.

## 5. Set up the event and rehearse
Control center → Players (roster, photos named after each player, Reclub links) → Courts (add doubles matches: two boxes per team) → Awards. Rehearse tomorrow with real phones on mobile data and the real TV, then **Settings & Data → Reset** to clear test data.

## Quick check: is everything connected?
Open `https://SITE/api/health` in a browser. It lists each setting as set/MISSING/WRONG and tests the database. It must say **"verdict": "ALL GOOD"**. It never shows your secret values. If it says something else, it tells you exactly what to fix.

## If something doesn't work
- **"Scoreboard not set up"** → the two Supabase variables are missing/wrong; fix and redeploy.
- **Code screen keeps returning** → the code is case-sensitive; check `VIEW_CODE`.
- **404 on /api/…** → make sure the repo contains `api/[...path].js` exactly (square brackets included).
- Vercel → project → **Logs** shows function errors.
- Vercel's free Hobby plan is meant for personal, non-commercial use. If this event is sponsor-backed, check which plan your account is on.
