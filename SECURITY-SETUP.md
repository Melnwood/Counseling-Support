# Sign-in setup (Google, josiahventure.com only)

The dashboard now requires Google sign-in, and only an allowlist of people
(you, Laura, Dan) can load any data. Two places enforce it:
- the page shows a sign-in gate before anything loads;
- every serverless function re-checks the Google token, the josiahventure.com
  domain, and the allowlist before returning data — so no one can bypass the
  page and hit the data directly.

## One-time setup (about 10 minutes)

### 1. Create a Google OAuth Client ID
1. Go to https://console.cloud.google.com → create/select a project (e.g. "JV Counseling").
2. APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add your site URL, e.g.
   `https://your-site.netlify.app` (and any custom domain).
5. Create. Copy the **Client ID** (looks like `1234-abc.apps.googleusercontent.com`).
   (You can ignore the client *secret* — not needed here.)

### 2. Put the Client ID in two places
- **index.html** → near the top of the script, in `CONFIG`, set
  `GOOGLE_CLIENT_ID: "…apps.googleusercontent.com"`.
- **Netlify → Site settings → Environment variables**, add:
  | Key | Value |
  |-----|-------|
  | `GOOGLE_CLIENT_ID` | the same client ID |
  | `ALLOWED_EMAILS` | `mellenwood@josiahventure.com, lhash@josiahventure.com, dhash@josiahventure.com` |
  | `ALLOWED_DOMAIN` | `josiahventure.com` (optional; this is the default) |
  | `AIRTABLE_TOKEN` | (already set) |

### 3. Deploy
Push the repo and let Netlify build. Visit the site — you should see the
sign-in gate. Sign in with a josiahventure.com account on the allowlist.

## Adding or removing who can get in
Edit the `ALLOWED_EMAILS` env var in Netlify (comma-separated) and redeploy.
No code change needed.

## Notes
- Google sign-in tokens last about an hour; when one expires the gate reappears
  and the person signs in again. Normal.
- Opened straight from disk (no site), the dashboard skips auth and shows the
  embedded snapshot — that's the preview mode, and it has no real data.

## Still open (GDPR follow-ups, not blockers)
- **Retention / deletion.** Archived records are hidden, not deleted. Decide how
  long counseling records live and add a real deletion rule.
- **Audit trail.** Consider logging who viewed / approved / changed a stage.
- **Data minimization.** Decide whether the director view needs the free-text
  "what's going on" field or just the stage.

## Retention & anonymization (now built in)
Archiving a case is now a **permanent close-out**: it captures the counselor who
served plus the close date, then deletes the person's name, email, phone, notes,
"why" text, spouse name, and signature. What remains on the record is the
**anonymous history** — type, culture, urgency, cost, dates, country/region,
counselor — used for reporting ("how many times we used each counselor", demand
by region and type over time). This satisfies the GDPR expectation that personal
data is removed once it's no longer needed, while keeping the statistics.

- **Reporting** = the archived records (personal fields blank). Build views/charts
  on the Applications table filtered to Archived = checked.
- **Country/Region** is collected on new applications going forward; the 11
  existing cases have it blank until re-entered.
- Restoring an archived case only un-hides it — cleared personal data does not
  come back.
