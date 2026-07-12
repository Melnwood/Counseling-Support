/**
 * Counseling Support — Director approval
 * --------------------------------------
 * POST { applicationId, counselorId }
 *
 * Approving = creating a row in the Director Approvals table with the
 * application linked, ONE counselor chosen, and ApplicationStatus = Approved.
 * That row is exactly what the Airtable automation
 * "Director Approved > Email to Counselor" watches:
 *
 *   Trigger: when a record in Director Approvals matches
 *            ApplicationStatus is Approved
 *            AND Counselors is not empty
 *            AND Application ID is not empty
 *   Action:  emails that counselor
 *
 * This replicates the prefilled Director Approval form 1:1. It is the same
 * write the form performs, so the same automation chain runs.
 *
 * >>> THIS SENDS AN EMAIL TO THE CHOSEN COUNSELOR. <<<
 *
 * Env vars:
 *   AIRTABLE_TOKEN    — PAT with data.records:read + data.records:write
 *   AIRTABLE_BASE_ID  — defaults to appbfOtX0IyCPV9T1
 */
const BASE  = process.env.AIRTABLE_BASE_ID || "appbfOtX0IyCPV9T1";
const TOKEN = process.env.AIRTABLE_TOKEN;

const APPLICATIONS_TABLE = "tbl8JpwXcI1DEvxof";
const APPROVALS_TABLE    = "Director Approvals";

/* Applications */
const A = {
  first: "fldxMDtlRzzEglkYn",
  last:  "fldAhAxq1UK2WjCSu",
  type:  "fldeFGYqZkNO3EttZ",
  counselors: "fldFsMIiavyx2UYfE"   // auto-generated eligible shortlist
};

/* Director Approvals */
const D = {
  first:     "fldnuYt5imv9apBhX",
  last:      "fldX8yEkvloNMkRqf",
  status:    "fldU92VnWQlVmIu0D",   // singleSelect: Approved
  type:      "fldnYCKihlAXnTP1z",   // singleSelect: Individual | Marriage | Spiritual Direction
  appLink:   "fld09Otf7VCm6d8QF",   // link -> Applications
  counselor: "fldNvaM3N5lIhi1T0",   // link -> Counselors (exactly one)
  date:      "fldI1SAcMlpX0DL1G"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "POST")    return respond(405, { error: "Use POST" });
  if (!TOKEN) return respond(500, { error: "Missing AIRTABLE_TOKEN" });

  let b;
  try { b = JSON.parse(event.body || "{}"); }
  catch { return respond(400, { error: "Invalid JSON body" }); }

  const applicationId = String(b.applicationId || "");
  const counselorId   = String(b.counselorId || "");
  if (!/^rec[A-Za-z0-9]{14}$/.test(applicationId)) return respond(400, { error: "Bad applicationId" });
  if (!/^rec[A-Za-z0-9]{14}$/.test(counselorId))   return respond(400, { error: "Bad counselorId" });

  try {
    // Read the application so names/type come from Airtable, not the browser.
    const appRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/${APPLICATIONS_TABLE}/${applicationId}?returnFieldsByFieldId=true`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    if (!appRes.ok) return respond(404, { error: "Application not found" });
    const app = await appRes.json();
    const f = app.fields || {};

    // The chosen counselor must be one of the eligible counselors on the
    // application — guards against approving someone who can't serve this type.
    const eligible = Array.isArray(f[A.counselors]) ? f[A.counselors] : [];
    if (eligible.length && !eligible.includes(counselorId)) {
      return respond(400, { error: "That counselor is not on this application's eligible list" });
    }

    // Don't double-approve: bail if an approval row already exists for this app.
    const existing = await findApproval(applicationId);
    if (existing) {
      return respond(409, {
        error: "This application already has a Director Approval — approving again would re-email a counselor."
      });
    }

    const type = f[A.type]?.name || f[A.type];
    const fields = {
      [D.first]:     f[A.first] || "",
      [D.last]:      f[A.last]  || "",
      [D.status]:    "Approved",
      [D.appLink]:   [applicationId],
      [D.counselor]: [counselorId],
      [D.date]:      new Date().toISOString().slice(0, 10)
    };
    if (type) fields[D.type] = type;

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(APPROVALS_TABLE)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: [{ fields }], typecast: true })
      }
    );
    const json = await res.json();
    if (!res.ok) return respond(res.status, { error: json?.error?.message || "Airtable rejected the approval" });

    return respond(200, {
      ok: true,
      id: json.records?.[0]?.id,
      message: "Approved. Airtable will now email the assigned counselor."
    });
  } catch (e) {
    return respond(500, { error: String(e?.message || e) });
  }
};

async function findApproval(applicationId) {
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(APPROVALS_TABLE)}`);
  url.searchParams.append("filterByFormula", `FIND("${applicationId}", ARRAYJOIN({Application ID}))`);
  url.searchParams.append("maxRecords", "1");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) return null;                       // don't block approval on a lookup hiccup
  const j = await r.json();
  return (j.records || [])[0] || null;
}

function respond(code, body) {
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}
