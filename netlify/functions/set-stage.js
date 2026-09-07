/**
 * Counseling Support — set the manual stage override
 * --------------------------------------------------
 * POST { applicationId, stage }
 *   stage = one of the six step labels, or "" / null to clear (back to auto).
 *
 * Writes the "Stage Override" single-select. When set, the dashboard shows the
 * person at that step regardless of the automatic calculation; when blank, the
 * process tracks them automatically. No automation keys off this field.
 *
 * Env: AIRTABLE_TOKEN (write), AIRTABLE_BASE_ID (defaults to appbfOtX0IyCPV9T1)
 */
const { verifyRequest } = require("./lib/auth");
const BASE  = process.env.AIRTABLE_BASE_ID || "appbfOtX0IyCPV9T1";
const TOKEN = process.env.AIRTABLE_TOKEN;
const APPLICATIONS_TABLE = "tbl8JpwXcI1DEvxof";
const STAGE_FIELD = "flduoyDtiNfF5dnG4";

const STAGES = ["Submitted", "Approved", "Counselor matched",
                "Schedule confirmed", "In counseling", "Transfer complete"];

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

  const stage = b.stage == null ? "" : String(b.stage);
  if (stage && !STAGES.includes(stage)) return respond(400, { error: "Unknown stage" });

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${APPLICATIONS_TABLE}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      // empty string clears the single-select back to blank (auto mode)
      body: JSON.stringify({ records: [{ id: applicationId, fields: { [STAGE_FIELD]: stage || null } }] })
    });
    const json = await res.json();
    if (!res.ok) return respond(res.status, { error: json?.error?.message || "Airtable rejected the update" });
    return respond(200, { ok: true, id: applicationId, stage });
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}
