// Función serverless (Vercel) — administración de reclutadores (aprobar / revocar).
// Solo la puede usar el/los dueño(s), definidos en la variable de entorno ADMIN_EMAILS
// (uno o varios emails separados por coma). Verifica el token del que llama contra Supabase.
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS.

var _rlStore = global.__voz_rl || (global.__voz_rl = {});
function rateLimited(key, max, windowMs) {
  var now = Date.now();
  var arr = (_rlStore[key] || []).filter(function (t) { return now - t < windowMs; });
  arr.push(now);
  _rlStore[key] = arr;
  if (Math.random() < 0.02) { for (var k in _rlStore) { var a = _rlStore[k]; if (!a.length || now - a[a.length - 1] > windowMs) delete _rlStore[k]; } }
  return arr.length > max;
}
function clientIp(req) {
  var xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.headers["x-real-ip"] || "unknown";
}

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

  // Rate limit: máx. 40 llamadas cada 5 minutos por IP.
  if (rateLimited("adm:" + clientIp(req), 40, 5 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

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
      // approve: aprobado. revoke: vuelve a pendiente.
      var up = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(b.targetId), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }),
        body: JSON.stringify({ approved: b.action === "approve" })
      });
      if (!up.ok) { var t = await up.text(); res.status(200).json({ ok: false, error: "update_failed", detail: t.slice(0, 200) }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    if (b.action === "reject") {
      if (!b.targetId) { res.status(200).json({ ok: false, error: "no_target" }); return; }
      // Desaprobar = eliminar el perfil para que DESAPAREZCA de la lista por completo.
      var delP = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(b.targetId), {
        method: "DELETE", headers: Object.assign({}, headers, { Prefer: "return=minimal" })
      });
      if (!delP.ok) { var t2 = await delP.text(); res.status(200).json({ ok: false, error: "delete_failed", detail: t2.slice(0, 200) }); return; }
      // Best-effort: borrar también la cuenta de autenticación, así la persona puede
      // volver a registrarse desde cero (con Google) si más adelante se la quiere aceptar.
      try {
        await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(b.targetId), {
          method: "DELETE", headers: { apikey: key, Authorization: "Bearer " + key }
        });
      } catch (e) {}
      res.status(200).json({ ok: true });
      return;
    }
    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
