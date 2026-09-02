// Función serverless (Vercel) — PÚBLICA. Firma del legajo por parte del empleado.
//   action "get":  devuelve datos básicos del legajo a partir del token de firma.
//   action "sign": guarda la firma (nombre + estilo) y la fecha de firma.
// El empleado NO tiene sesión: se usa la SERVICE ROLE del lado del servidor.
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
  if (rateLimited("sign:" + clientIp(req), 40, 5 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var token = String(b.token || "").trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) { res.status(200).json({ ok: false, error: "bad_token" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    // Buscar el empleado por token (con todos los datos del legajo para mostrarle qué firma)
    var er = await fetch(base + "/rest/v1/employees?sign_token=eq." + encodeURIComponent(token) + "&select=id,first_name,last_name,legajo_number,dni,cuil,birth_date,address,email,phone,hire_date,position,category,collective_agreement,contract_type,salary,shift_in,shift_out,work_days,schedule_type,signature_name,signature_font,signed_at&limit=1", { headers: headers });
    var rows = await er.json();
    var emp = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!emp) { res.status(200).json({ ok: false, error: "not_found" }); return; }

    if (b.action === "get") {
      res.status(200).json({ ok: true, employee: {
        first_name: emp.first_name || "", last_name: emp.last_name || "", legajo_number: emp.legajo_number || "",
        dni: emp.dni || "", cuil: emp.cuil || "", birth_date: emp.birth_date || "", address: emp.address || "",
        email: emp.email || "", phone: emp.phone || "", hire_date: emp.hire_date || "",
        position: emp.position || "", category: emp.category || "", collective_agreement: emp.collective_agreement || "",
        contract_type: emp.contract_type || "", salary: emp.salary || "",
        shift_in: emp.shift_in || "", shift_out: emp.shift_out || "", work_days: emp.work_days || "", schedule_type: emp.schedule_type || "",
        signature_name: emp.signature_name || "", signature_font: emp.signature_font || 1,
        signed_at: emp.signed_at || null
      } });
      return;
    }

    if (b.action === "sign") {
      var signName = String(b.signature_name || "").slice(0, 120).trim();
      var signFont = parseInt(b.signature_font, 10); if (isNaN(signFont) || signFont < 1 || signFont > 4) signFont = 1;
      if (!signName) { res.status(200).json({ ok: false, error: "no_name" }); return; }
      var patch = { signature_name: signName, signature_font: signFont, signed_at: new Date().toISOString() };
      var pr = await fetch(base + "/rest/v1/employees?id=eq." + encodeURIComponent(emp.id), {
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
