# Fixing the intake-email gap (cost tiers)

## What's broken

The **Your Cost** field is a formula reading five "I agree to pay $X from my JV
account" checkboxes:

```
IF({$0},    0,
IF({$240},  240,
IF({$180},  180,
IF({$360},  360,
IF({$480},  480)))))
```

| Tier | Checkbox field ID   |
|------|---------------------|
| $0   | `fldPzP9T9a8EVTlDv` |
| $240 | `fldBO0Wil80JvIjKp` |
| $180 | `fld2txR7riLAOKfDR` |
| $360 | `fldQ2STSxsv2GLZ4r` |
| $480 | `fldAItgc8oY4axOgM` |

The only intake automation that is **ON** — **New Staff Counselling Request**
(emails the counseling directors, dhash@ and lhash@) — has a trigger condition
on the **$180 checkbox only**.

The other four tiers have their own automations — `$240`, `$180`,
`$360 (2nd Culture)`, `$480 (2nd Culture)` — and **all four are OFF**.

**Result:** an applicant who agrees to any tier other than $180 generates an
application that never emails the directors. It sits silently in the base.
(Zuzi ticked $180 → intake fired. Laura ticked $0 *and* $360 → it didn't.)

This is a live bug affecting real applicants, independent of the new creator.

## The fix (2 minutes, in Airtable)

Make intake fire on **any submitted application**, regardless of cost tier.

1. Open **Automations → New Staff Counselling Request**.
2. Click the **trigger** ("When a record matches conditions").
3. **Remove** the condition on the $180 checkbox.
4. **Replace** it with:
   - Table: **Applications**
   - When **Application Status** — **is** — **Submitted**
5. Leave the actions untouched. Save.

`Application Status` is set to *Submitted* by the **Update Status to Submitted**
automation the moment any record is created, so this now catches every
application no matter which tier they pick.

Leave the four tier automations (`$240`, `$180`, `$360`, `$480`) **OFF** — with
the trigger above they'd be redundant and would send duplicate emails.

### Optional tightening
If you want to be certain the email never fires on a half-written row, add a
second condition: **and Email is not empty**.

## Verify

After the change, create a test application from the dashboard using your own
email and the **$360** tier (a tier that is broken today). You should receive
the intake email at dhash@/lhash@. Before the fix, $360 sends nothing.

## Blast radius — what a new application actually triggers

Only two automations run at creation:

1. **Update Status to Submitted** — sets status, sends no email.
2. **New Staff Counselling Request** — emails the counseling directors.

Counselors are **not** emailed at creation. That only happens via **Director
Approved > Email to Counselor**, which watches the **Director Approvals** table
and requires ApplicationStatus = Approved *and* Counselors not empty. Staff and
accountant emails sit further down the chain still.

So creating an application — test or real — reaches **two inboxes**, both
directors. Nothing goes to counselors or staff until you approve.
