/**
 * Counseling Support — archive / unarchive an application
 * -------------------------------------------------------
 * POST { applicationId, archived }
 *
 * Flips the "Archived" checkbox on the Applications table. Archiving only
 * hides the request from the dashboard's active view — the record and its
 * full history stay in Airtable, and NO automation keys off this field, so
 * nothing in the counseling process is affected.
 *
 * Env vars:
 *   AIRTABLE_TOKEN    — PAT with data.records:write
 *   AIRTABLE_BASE_ID  — defaults to appbfOtX0IyCPV9T1
 */
const BASE  = process.env.AIRTABLE_BASE_ID || "appbfOtX0IyCPV9T1";
const TOKEN = process.env.AIRTABLE_TOKEN;
const APPLICATIONS_TABLE = "tbl8JpwXcI1DEvxof";
const ARCHIVED_FIELD = "fldqEjwvlpwPodIAW";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "POST")    return respond(405, { error: "Use POST" });
  if (!TOKEN) return respond(500, { error: "Missing AIRTABLE_TOKEN" });

  let b;
  try { b = JSON.parse(event.body || "{}"); }
  catch { return respond(400, { error: "Invalid JSON body" }); }

  const applicationId = String(b.applicationId || "");
  if (!/^rec[A-Za-z0-9]{14}$/.test(applicationId)) return respond(400, { error: "Bad applicationId" });
  const archived = b.archived !== false;   // default true; pass false to restore

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${APPLICATIONS_TABLE}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ id: applicationId, fields: { [ARCHIVED_FIELD]: archived } }] })
    });
    const json = await res.json();
    if (!res.ok) return respond(res.status, { error: json?.error?.message || "Airtable rejected the update" });
    return respond(200, { ok: true, id: applicationId, archived });
  } catch (e) {
    return respond(500, { error: String(e?.message || e) });
  }
};

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
