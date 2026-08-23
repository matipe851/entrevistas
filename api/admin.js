// Función serverless (Vercel) — administración de reclutadores (aprobar / revocar).
// Solo la puede usar el/los dueño(s), definidos en la variable de entorno ADMIN_EMAILS
// (uno o varios emails separados por coma). Verifica el token del que llama contra Supabase.
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS.

async function callerEmail(base, anonOrService, token) {
  try {
    var r = await fetch(base + "/auth/v1/user", { headers: { apikey: anonOrService, Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    var u = await r.json();
    return (u && u.email) ? String(u.email).toLowerCase() : null;
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    if (!b.token) { res.status(200).json({ ok: false, error: "no_token" }); return; }

    var base = url.replace(/\/+$/, "");
    var email = await callerEmail(base, key, b.token);
    if (!email || admins.indexOf(email) < 0) { res.status(200).json({ ok: false, error: "not_admin" }); return; }

    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    if (b.action === "list") {
      var r = await fetch(base + "/rest/v1/profiles?select=id,email,approved,created_at&order=created_at.desc", { headers: headers });
      var rows = await r.json();
      res.status(200).json({ ok: true, profiles: Array.isArray(rows) ? rows : [] });
      return;
    }
    if (b.action === "approve" || b.action === "revoke") {
      if (!b.targetId) { res.status(200).json({ ok: false, error: "no_target" }); return; }
      var patch = { approved: (b.action === "approve") };
      var up = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(b.targetId), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(patch)
      });
      if (!up.ok) { var t = await up.text(); res.status(200).json({ ok: false, error: "update_failed", detail: t.slice(0, 200) }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
