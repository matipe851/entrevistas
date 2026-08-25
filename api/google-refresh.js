// Función serverless (Vercel) — renueva el access token de Google a partir del refresh token
// del usuario. Necesita las credenciales de la app OAuth (las mismas que cargás en Supabase):
//   GOOGLE_CLIENT_ID      -> Client ID de la app OAuth (Google Cloud)
//   GOOGLE_CLIENT_SECRET  -> Client Secret de esa app
// Devuelve { ok:true, access_token, expires_in } o { ok:false, error }.

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var clientId = process.env.GOOGLE_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  if (rateLimited("gr:" + clientIp(req), 60, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }
  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var refreshToken = String(b.refreshToken || "").trim();
    if (!refreshToken) { res.status(200).json({ ok: false, error: "no_refresh_token" }); return; }

    var form = new URLSearchParams();
    form.set("client_id", clientId);
    form.set("client_secret", clientSecret);
    form.set("refresh_token", refreshToken);
    form.set("grant_type", "refresh_token");

    var r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    var j = await r.json().catch(function () { return {}; });
    if (r.ok && j && j.access_token) { res.status(200).json({ ok: true, access_token: j.access_token, expires_in: j.expires_in || 3600 }); return; }
    res.status(200).json({ ok: false, error: "refresh_failed", detail: String((j && (j.error_description || j.error)) || ("HTTP " + r.status)).slice(0, 300) });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
