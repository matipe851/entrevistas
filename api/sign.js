// Función serverless (Vercel) — PÚBLICA. Firma de UN documento del legajo por el empleado.
//   action "get":  devuelve los datos del documento a partir de su token de firma.
//   action "sign": guarda la firma (nombre + estilo) y la fecha en ese documento.
// El empleado NO tiene sesión: se usa la SERVICE ROLE del lado del servidor.
// El documento vive dentro de employees.documents (jsonb array). Se ubica al empleado
// por contención jsonb: documents @> [{"sign_token":"<token>"}].
// Variables de entorno en Vercel: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.

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
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  if (rateLimited("signdoc:" + clientIp(req), 40, 5 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var token = String(b.token || "").trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) { res.status(200).json({ ok: false, error: "bad_token" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    // Buscar al empleado cuyo array documents contenga un doc con este sign_token.
    var contains = encodeURIComponent(JSON.stringify([{ sign_token: token }]));
    var er = await fetch(base + "/rest/v1/employees?documents=cs." + contains + "&select=id,first_name,last_name,documents&limit=1", { headers: headers });
    var rows = await er.json();
    var emp = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!emp || !Array.isArray(emp.documents)) { res.status(200).json({ ok: false, error: "not_found" }); return; }

    var idx = -1;
    for (var i = 0; i < emp.documents.length; i++) { if (emp.documents[i] && emp.documents[i].sign_token === token) { idx = i; break; } }
    if (idx < 0) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var doc = emp.documents[idx];
    var empName = ((emp.first_name || "") + " " + (emp.last_name || "")).trim();

    if (b.action === "get") {
      res.status(200).json({ ok: true, employee_name: empName, doc: {
        label: doc.label || "Documento", filename: doc.filename || "archivo", url: doc.url || "",
        signature_name: doc.signature_name || "", signature_font: doc.signature_font || 1,
        signed_at: doc.signed_at || null
      } });
      return;
    }

    if (b.action === "sign") {
      var signName = String(b.signature_name || "").slice(0, 120).trim();
      var signFont = parseInt(b.signature_font, 10); if (isNaN(signFont) || signFont < 1 || signFont > 4) signFont = 1;
      if (!signName) { res.status(200).json({ ok: false, error: "no_name" }); return; }
      doc.signature_name = signName; doc.signature_font = signFont; doc.signed_at = new Date().toISOString();
      emp.documents[idx] = doc;
      var pr = await fetch(base + "/rest/v1/employees?id=eq." + encodeURIComponent(emp.id), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify({ documents: emp.documents })
      });
      if (!pr.ok) { res.status(200).json({ ok: false, error: "save_failed" }); return; }
      res.status(200).json({ ok: true, signed_at: doc.signed_at });
      return;
    }

    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
