/**
 * Counseling Support — archive & anonymize
 * ----------------------------------------
 * POST { applicationId, archived }
 *
 * archived=true  → CLOSE OUT a case. This is PERMANENT:
 *   1. capture the counselor who served (from Director Approvals) into a text
 *      field, and stamp the close date;
 *   2. clear the personal fields — name, email, phone, notes, the "why" text,
 *      spouse name, and the signature attachment;
 *   3. set Archived = true (hides it from the active view).
 *   What's left is the anonymous history — type, culture, urgency, cost, dates,
 *   country, counselor — which is what the reporting reads. Personal data is
 *   gone and cannot be restored.
 *
 * archived=false → simply un-hide (Archived = false). If the record was already
 *   anonymized, the personal fields stay gone — restore only un-hides.
 *
 * No automation keys off Archived, so this never disturbs the process.
 */
const { verifyRequest } = require("./lib/auth");

const BASE  = process.env.AIRTABLE_BASE_ID || "appbfOtX0IyCPV9T1";
const TOKEN = process.env.AIRTABLE_TOKEN;
const APPLICATIONS_TABLE = "tbl8JpwXcI1DEvxof";
const APPROVALS_TABLE    = "Director Approvals";

const ARCHIVED_FIELD   = "fldqEjwvlpwPodIAW"; // Archived (checkbox)
const CLOSED_DATE      = "fld3Vee3tXEmFQsu3"; // Closed Date
const COUNSELOR_SERVED = "flda5w64r4MfFUouX"; // Counselor (served) text

// Personal fields cleared on close-out.
const PII_FIELDS = [
  "fldxMDtlRzzEglkYn", // First Name
  "fldAhAxq1UK2WjCSu", // Last Name
  "fld2ICZrCti8r21tw", // Email
  "fldIRkQcKS7cU40QY", // Phone
  "fld6rI7wOxu3tlekF", // Additional Notes
  "fldcl3kZDahNwDiH0", // Why are you looking for a new counselor?
  "fldOhbUFKlJnriCW0"  // Spouse First Name
];
const SIGNATURE_FIELD = "fldPdeqvqty7wwWqK"; // attachment — cleared with []

// Director Approvals: the assigned-counselor first-name lookup.
const DA_COUNSELOR_NAME = "fldHtbN6EswQYeZxF";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "POST")    return respond(405, { error: "Use POST" });
  if (!TOKEN) return respond(500, { error: "Missing AIRTABLE_TOKEN" });

  const gate = await verifyRequest(event);
  if (!gate.ok) return gate.res;

  let b;
  try { b = JSON.parse(event.body || "{}"); }
  catch { return respond(400, { error: "Invalid JSON body" }); }

  const applicationId = String(b.applicationId || "");
  if (!/^rec[A-Za-z0-9]{14}$/.test(applicationId)) return respond(400, { error: "Bad applicationId" });
  const archived = b.archived !== false;

  try {
    if (!archived) {
      await patch(applicationId, { [ARCHIVED_FIELD]: false });
      return respond(200, { ok: true, id: applicationId, archived: false });
    }

    // capture the counselor who served, from the Director Approval for this app
    let counselorName = "";
    try {
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(APPROVALS_TABLE)}`);
      url.searchParams.append("filterByFormula", `FIND("${applicationId}", ARRAYJOIN({Record ID (from Application ID)}))`);
      url.searchParams.append("maxRecords", "1");
      url.searchParams.append("returnFieldsByFieldId", "true");
      const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (r.ok) {
        const rec = ((await r.json()).records || [])[0];
        const nm = rec && rec.fields && rec.fields[DA_COUNSELOR_NAME];
        counselorName = Array.isArray(nm) ? nm.join(", ") : (nm || "");
      }
    } catch { /* non-fatal */ }

    const fields = {
      [ARCHIVED_FIELD]: true,
      [CLOSED_DATE]: new Date().toISOString().slice(0, 10)
    };
    if (counselorName) fields[COUNSELOR_SERVED] = counselorName;
    PII_FIELDS.forEach(f => { fields[f] = ""; });
    fields[SIGNATURE_FIELD] = [];

    await patch(applicationId, fields);
    return respond(200, { ok: true, id: applicationId, archived: true, anonymized: true });
  } catch (e) {
    return respond(500, { error: String(e?.message || e) });
  }
};

async function patch(id, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${APPLICATIONS_TABLE}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ id, fields }] })
  });
  if (!res.ok) throw new Error(((await res.json())?.error?.message) || "Airtable rejected the update");
  return res.json();
}

function respond(code, body) {
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}
