/**
 * Counseling Support — Applications proxy
 * ---------------------------------------
 * Reads the Applications + Counselors tables through your Airtable
 * token and returns clean records with counselor names already
 * resolved (Airtable's REST API returns linked records as IDs).
 *
 * Required Netlify environment variable:
 *   AIRTABLE_TOKEN   — a personal access token with data.records:read
 *                      scope on base appbfOtX0IyCPV9T1
 * Optional:
 *   AIRTABLE_BASE_ID — defaults to appbfOtX0IyCPV9T1
 */
const { verifyRequest, cors } = require("./lib/auth");
const BASE  = process.env.AIRTABLE_BASE_ID || "appbfOtX0IyCPV9T1";
const TOKEN = process.env.AIRTABLE_TOKEN;

const APPLICATIONS_TABLE   = "tbl8JpwXcI1DEvxof";
const COUNSELORS_TABLE     = "Counselors";                 // resolved by name via REST
const COUNSELOR_LINK_FIELD  = "fldFsMIiavyx2UYfE";         // Applications -> Counselors
const COUNSELOR_NAME_FIELD  = "fldzeTvZO3un9aL4V";         // Counselors full-name field
const COUNSELOR_TYPES_FIELD = "flduetAMDeeL7u2Ts";         // Individual / Marriage / Spiritual Direction
const COUNSELOR_SERVES_FIELD= "flda0OIWKkZqgkx7o";         // Men / Women
const COUNSELOR_FREE_FIELD  = "fldKrdoLdkchg6841";         // "$0 Cost" — checked means this counselor is free

const APP_FIELDS = [
  "fldxMDtlRzzEglkYn", // First Name
  "fldAhAxq1UK2WjCSu", // Last Name
  "fld2ICZrCti8r21tw", // Email
  "fldPxsR3bb4o4fPuZ", // Application #
  "fldeFGYqZkNO3EttZ", // Counseling Type
  "fld61ukbkJ58h2kVD", // Urgency
  "fld8wV9MjFotORTy2", // Application Status
  "fldbQhQMy7272nfhC", // Status (formula)
  "fldSpxQ8mgzbxUlrk", // Counselor matched (Yes/No)
  "fldd3dQ2vqg3wsupF", // Transfer Has Been Made
  "fldKD4EADERIGsoLN", // Submitted date
  "fldpH7piGlH759TxR", // Amount to withdraw from staff account
  "fld6rI7wOxu3tlekF", // Additional Notes (short reason)
  "fldcl3kZDahNwDiH0", // Why looking for a new counselor
  "fldOhbUFKlJnriCW0", // Spouse First Name
  "fldIRkQcKS7cU40QY", // Phone
  "fldFFxDoF1wCHbUwv", // Culture (1st / 2nd)
  "fldPbY6QcZoVQvhhp", // Country / Region
  "fldqEjwvlpwPodIAW", // Archived
  "flduoyDtiNfF5dnG4", // Stage Override
  COUNSELOR_LINK_FIELD
];

async function at(path, params) {
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(path)}`);
  (params || []).forEach(([k, v]) => url.searchParams.append(k, v));
  // Airtable keys fields BY NAME unless this is set — we read by field ID.
  url.searchParams.set("returnFieldsByFieldId", "true");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function fetchAll(path, params) {
  let records = [], offset;
  do {
    const p = [...(params || [])];
    if (offset) p.push(["offset", offset]);
    const j = await at(path, p);
    records = records.concat(j.records || []);
    offset = j.offset;
  } while (offset);
  return records;
}

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  const gate = await verifyRequest(event);
  if (!gate.ok) return gate.res;

  try {
    if (!TOKEN) return respond(500, { error: "Missing AIRTABLE_TOKEN environment variable" });

    // 1) counselors: id -> name, plus specialties / who they see
    const counselors = await fetchAll(COUNSELORS_TABLE, [
      ["fields[]", COUNSELOR_NAME_FIELD],
      ["fields[]", COUNSELOR_TYPES_FIELD],
      ["fields[]", COUNSELOR_SERVES_FIELD],
      ["fields[]", COUNSELOR_FREE_FIELD]
    ]);
    const nameById = {};
    const counselorMeta = [];
    counselors.forEach(c => {
      const nm = (c.fields[COUNSELOR_NAME_FIELD] || "").trim();
      nameById[c.id] = nm;
      counselorMeta.push({
        id: c.id,
        name: nm,
        types: c.fields[COUNSELOR_TYPES_FIELD] || [],
        serves: c.fields[COUNSELOR_SERVES_FIELD] || [],
        free: !!c.fields[COUNSELOR_FREE_FIELD]
      });
    });

    // 2) applications, with linked counselors swapped to names
    const params = APP_FIELDS.map(f => ["fields[]", f]);
    params.push(["pageSize", "100"]);
    const apps = await fetchAll(APPLICATIONS_TABLE, params);

    const records = apps.map(r => {
      const f = { ...r.fields };
      const links = f[COUNSELOR_LINK_FIELD];
      if (Array.isArray(links)) {
        f[COUNSELOR_LINK_FIELD] = links.map(id => ({ id, name: nameById[id] || id }));
      }
      return { id: r.id, fields: f };
    });

    return respond(200, { records, counselors: counselorMeta }, true);
  } catch (e) {
    return respond(500, { error: String(e && e.message || e) });
  }
};

function respond(code, body, cache) {
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cache ? "public, max-age=60" : "no-store",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
