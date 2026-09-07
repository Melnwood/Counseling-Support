/**
 * Shared auth gate for all functions.
 * Verifies the Google Sign-In token server-side, confirms it's a
 * josiahventure.com account, and checks it against the allowlist.
 * Nothing returns data unless verifyRequest() says ok.
 *
 * Env vars:
 *   GOOGLE_CLIENT_ID  — the OAuth client ID (also embedded in index.html)
 *   ALLOWED_EMAILS    — comma-separated allowlist (mel@, lhash@, dhash@ ...)
 *   ALLOWED_DOMAIN    — defaults to josiahventure.com
 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const DOMAIN    = (process.env.ALLOWED_DOMAIN || "josiahventure.com").toLowerCase();
const ALLOWED   = (process.env.ALLOWED_EMAILS || "")
  .toLowerCase().split(",").map(s => s.trim()).filter(Boolean);

async function verifyRequest(event) {
  const h = event.headers || {};
  const authz = h.authorization || h.Authorization || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return deny(401, "Please sign in.");

  let claims;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(m[1]));
    if (!r.ok) return deny(401, "Your sign-in has expired — please sign in again.");
    claims = await r.json();
  } catch {
    return deny(401, "Couldn't verify your sign-in. Try again.");
  }

  // Token must be issued for THIS app.
  if (CLIENT_ID && claims.aud !== CLIENT_ID) return deny(401, "Sign-in token isn't for this app.");
  // Google must have verified the email.
  if (claims.email_verified !== "true" && claims.email_verified !== true) return deny(403, "Email not verified.");

  const email = (claims.email || "").toLowerCase();
  const domainOk = (claims.hd && claims.hd.toLowerCase() === DOMAIN) || email.endsWith("@" + DOMAIN);
  if (!domainOk) return deny(403, `Please use your ${DOMAIN} account.`);

  // Allowlist: only these people may see counseling records.
  if (ALLOWED.length && !ALLOWED.includes(email)) {
    return deny(403, "Your account isn't authorized for this dashboard. Contact Mel to be added.");
  }

  return { ok: true, email };
}

function deny(code, message) {
  return { ok: false, res: {
    statusCode: code,
    headers: cors(),
    body: JSON.stringify({ error: message })
  }};
}

function cors() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

module.exports = { verifyRequest, cors };
