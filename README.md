# Counseling Care Journey

A director-facing dashboard for the JV **Counseling Support** Airtable base
(`appbfOtX0IyCPV9T1`). Shows where every applicant sits in the care process,
who's carrying which counseling load, and lets the director create and approve
applications without leaving the page.

Stack: single-file HTML + Netlify serverless functions + Airtable.

---

## Files

| File | What it is |
|------|-----------|
| `index.html` | The whole dashboard — UI, logic, styles. Falls back to an embedded snapshot if the functions aren't reachable. |
| `netlify/functions/counseling-applications.js` | **Read.** Pulls Applications + Counselors, resolves counselor links to names. |
| `netlify/functions/create-application.js` | **Write.** Creates an application (the "+ New application" button). |
| `netlify/functions/approve-application.js` | **Write.** Creates a Director Approval → triggers the counselor email. |
| `netlify.toml` | Points Netlify at the functions folder. |
| `AUTOMATION-FIX.md` | The cost-tier intake bug and how to fix it. **Read this.** |

---

## Deploy

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Counseling care journey dashboard"
git branch -M main
git remote add origin git@github.com:Melnwood/counseling-care-journey.git
git push -u origin main
```

### 2. Connect to Netlify

New site → import from GitHub → pick the repo.
No build command needed. Publish directory: `.`

### 3. Add the Airtable token

Site settings → **Environment variables** → add:

| Key | Value |
|-----|-------|
| `AIRTABLE_TOKEN` | Personal access token (see scopes below) |
| `AIRTABLE_BASE_ID` | `appbfOtX0IyCPV9T1` *(optional — this is the default)* |

The token needs, on base `appbfOtX0IyCPV9T1`:

- `data.records:read`
- `data.records:write` — required for the New application and Approve buttons

Deploy. Done.

---

## What the buttons actually do

**+ New application** → writes a row to Applications, setting exactly one of the
five "I agree to pay $X" checkboxes. Every automation in this base is triggered
by *record created* or *record matches conditions* — there are **no**
form-submitted triggers — so the normal chain runs just as it would from the
Fillout form. `Update Status to Submitted` fires and stamps the status.

**Approve** (inside an applicant awaiting approval) → writes a row to
**Director Approvals** with the application, one chosen counselor, and status
Approved. That is the trigger for `Director Approved > Email to Counselor`.

> **This emails the counselor you pick.** One counselor — not the whole eligible
> list. It's guarded: it confirms first, re-reads the application server-side,
> rejects a counselor who isn't eligible for that counseling type, and refuses
> to approve an application that already has an approval (no duplicate emails).

Creating an application reaches **two inboxes only** — the counseling directors
(dhash@, lhash@). Counselors are not contacted until you approve.

---

## Known issue in the base

The intake email only fires for the **$180** cost tier. Applicants who pick any
other tier are never surfaced to the directors. See `AUTOMATION-FIX.md` — it's a
two-minute trigger change in Airtable.

---

## Editing

- **The six process steps** — the `STEPS` array near the top of the `<script>`.
- **The groupings** (New / In the pipeline / In counseling / Complete) — the
  `GROUPS` array and `groupKeyFor()`.
- **Urgency colors** — the `--u-low` / `--u-med` / `--u-high` CSS variables.
- **The snapshot** — `SNAPSHOT` in the script; only used when the functions
  can't be reached (e.g. opening `index.html` straight off disk).
