/**
 * Counseling Support — create an Application
 * ------------------------------------------
 * POST { firstName, lastName, email, phone, type, urgency,
 *        reason, detail, culture, costTier }
 *
 * Writes a row into the Applications table exactly the way the
 * Fillout form does. Because every automation in this base is
 * triggered by "record created" or "record matches conditions"
 * (there are NO form-submitted triggers), the normal chain runs:
 *   - "Update Status to Submitted" fires on creation
 *   - the intake email to the counseling directors fires off the
 *     cost-agreement checkbox
 *
 * Env vars (Netlify):
 *   AIRTABLE_TOKEN    — PAT with data.records:write on the base
 *   AIRTABLE_BASE_ID  — defaults to appbfOtX0IyCPV9T1
 */
const { verifyRequest } = require("./lib/auth");
const BASE  = process.env.AIRTABLE_BASE_ID || "appbfOtX0IyCPV9T1";
const TOKEN = process.env.AIRTABLE_TOKEN;
const APPLICATIONS_TABLE = "tbl8JpwXcI1DEvxof";

const F = {
  first:    "fldxMDtlRzzEglkYn",  // First Name
  last:     "fldAhAxq1UK2WjCSu",  // Last Name
  email:    "fld2ICZrCti8r21tw",  // Email
  phone:    "fldIRkQcKS7cU40QY",  // Phone (number)
  reason:   "fld6rI7wOxu3tlekF",  // Short reason
  detail:   "fldcl3kZDahNwDiH0",  // Longer description
  type:     "fldeFGYqZkNO3EttZ",  // Individual | Marriage | Spiritual Direction
  urgency:  "fld61ukbkJ58h2kVD",  // Low | Medium | High
  culture:  "fldFFxDoF1wCHbUwv",  // 1st | 2nd
  country:  "fldPbY6QcZoVQvhhp",  // Country / Region
  date:     "fldzWmA9BX4E02S3m"   // Date submitted
};

/* The five "I agree to pay $X from my JV account" checkboxes.
   "Amount to withdraw from staff account" is a formula reading these,
   so exactly one must be set. */
const COST_CHECKBOX = {
  "0":   "fldPzP9T9a8EVTlDv",   // $0 Cost for counseling or Spiritual Direction
  "240": "fldBO0Wil80JvIjKp",
  "180": "fld2txR7riLAOKfDR",
  "360": "fldQ2STSxsv2GLZ4r",
  "480": "fldAItgc8oY4axOgM"
};

/* The tier is a function of counseling type + culture.
   1st culture pays the lower rate, 2nd culture the higher.
   Spiritual direction is charged at the Individual rate.

                          1st      2nd
     Individual           $180     $360
     Spiritual Direction  $180     $360
     Marriage             $240     $480

   NOTE: this is what the staff member agrees to pay IF their counselor charges.
   Several counselors are free (Laura Hash, Dan Hash, Joe Brooks, Bartek Tesluk,
   Sharon Mormance, David Bordner, Brenda Nickerson, Audrey Chestnut) — when one
   of them is assigned at approval, the cost drops to $0. That's resolved later,
   not here. Use noCost to force $0 up front. */
function deriveTier(type, culture) {
  const second = culture === "2nd";
  if (type === "Marriage") return second ? "480" : "240";
  if (type === "Individual" || type === "Spiritual Direction") return second ? "360" : "180";
  return null;
}

const TYPES     = ["Individual", "Marriage", "Spiritual Direction"];
const URGENCIES = ["Low", "Medium", "High"];
const CULTURES  = ["1st", "2nd"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "POST")    return respond(405, { error: "Use POST" });
  if (!TOKEN) return respond(500, { error: "Missing AIRTABLE_TOKEN" });

  const gate = await verifyRequest(event);
  if (!gate.ok) return gate.res;

  let b;
  try { b = JSON.parse(event.body || "{}"); }
  catch { return respond(400, { error: "Invalid JSON body" }); }

  const first = (b.firstName || "").trim();
  const last  = (b.lastName  || "").trim();
  const email = (b.email     || "").trim();

  const missing = [];
  if (!first) missing.push("first name");
  if (!last)  missing.push("last name");
  if (!email) missing.push("email");
  if (missing.length) return respond(400, { error: `Missing: ${missing.join(", ")}` });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return respond(400, { error: "Invalid email" });

  if (b.type     && !TYPES.includes(b.type))         return respond(400, { error: "Bad type" });
  if (b.urgency  && !URGENCIES.includes(b.urgency))  return respond(400, { error: "Bad urgency" });
  if (b.culture  && !CULTURES.includes(b.culture))   return respond(400, { error: "Bad culture" });

  // Tier is derived, not chosen — unless flagged as no-cost (scholarship / free counselor).
  const costKey = b.noCost ? "0" : deriveTier(b.type, b.culture);
  if (!costKey || !(costKey in COST_CHECKBOX)) {
    return respond(400, { error: "Could not work out the cost tier from that type and culture" });
  }

  // Build the row. Application Status is deliberately NOT set —
  // the "Update Status to Submitted" automation sets it on creation,
  // which is also how we verify that automation fired.
  const fields = {
    [F.first]: first,
    [F.last]:  last,
    [F.email]: email,
    [F.date]:  new Date().toISOString().slice(0, 10)
  };
  if (b.phone)   fields[F.phone]   = Number(String(b.phone).replace(/\D/g, "")) || undefined;
  if (b.reason)  fields[F.reason]  = String(b.reason).slice(0, 500);
  if (b.detail)  fields[F.detail]  = String(b.detail).slice(0, 5000);
  if (b.type)    fields[F.type]    = b.type;
  if (b.urgency) fields[F.urgency] = b.urgency;
  if (b.culture) fields[F.culture] = b.culture;
  if (b.country)  fields[F.country]  = String(b.country).slice(0,120);

  // Exactly one cost checkbox — this is what the intake email keys off.
  fields[COST_CHECKBOX[costKey]] = true;

  Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${APPLICATIONS_TABLE}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    const json = await res.json();
    if (!res.ok) return respond(res.status, { error: json?.error?.message || "Airtable rejected the record" });

    const rec = json.records?.[0];
    return respond(200, {
      ok: true,
      id: rec?.id,
      amount: Number(costKey),
      message: `Application created — staff share $${costKey}. Airtable automations run as they do for a form submission.`
    });
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
