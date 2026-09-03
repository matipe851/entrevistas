// Función serverless (Vercel) — PÚBLICA. Firma de UN documento (área Documentación) por el empleado.
//   action "get":  devuelve los datos del documento a partir de su token de firma.
//   action "sign": guarda la firma (nombre + estilo) y la fecha en ese documento.
// El empleado NO tiene sesión: se usa la SERVICE ROLE del lado del servidor.
// El documento vive en la tabla hr_documents; se ubica por su columna sign_token (indexada).
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

    // Buscar el documento por su token, embebiendo el nombre del empleado.
    var sel = "id,type,title,detail,doc_date,file_url,file_name,signed,signed_at,signature_name,signature_font,employees(first_name,last_name)";
    var er = await fetch(base + "/rest/v1/hr_documents?sign_token=eq." + encodeURIComponent(token) + "&select=" + encodeURIComponent(sel) + "&limit=1", { headers: headers });
    var rows = await er.json();
    var doc = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!doc) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var emp = doc.employees || {};
    var empName = ((emp.first_name || "") + " " + (emp.last_name || "")).trim();

    if (b.action === "get") {
      res.status(200).json({ ok: true, employee_name: empName, doc: {
        label: doc.title || (doc.type ? String(doc.type) : "Documento"),
        type: doc.type || "", filename: doc.file_name || "", url: doc.file_url || "",
        detail: doc.detail || "", doc_date: doc.doc_date || "",
        signature_name: doc.signature_name || "", signature_font: doc.signature_font || 1,
        signed_at: doc.signed_at || null
      } });
      return;
    }

    if (b.action === "sign") {
      var signName = String(b.signature_name || "").slice(0, 120).trim();
      var signFont = parseInt(b.signature_font, 10); if (isNaN(signFont) || signFont < 1 || signFont > 4) signFont = 1;
      if (!signName) { res.status(200).json({ ok: false, error: "no_name" }); return; }
      var patch = { signature_name: signName, signature_font: signFont, signed_at: new Date().toISOString(), signed: true };
      var pr = await fetch(base + "/rest/v1/hr_documents?id=eq." + encodeURIComponent(doc.id), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(patch)
      });
      if (!pr.ok) { res.status(200).json({ ok: false, error: "save_failed" }); return; }
      res.status(200).json({ ok: true, signed_at: patch.signed_at });
      return;
    }

    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
