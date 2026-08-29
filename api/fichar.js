// Función serverless (Vercel) — PÚBLICA. Fichador de asistencia.
//   action "info":  valida el código del fichador y devuelve el nombre de la empresa/marca.
//   action "punch": registra una fichada (entrada/salida). Busca el empleado por N° de legajo
//                   dentro del dueño del fichador y guarda foto, ubicación y la HORA DEL SERVIDOR.
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
async function ownerByCode(base, headers, code) {
  var r = await fetch(base + "/rest/v1/fichador_config?code=eq." + encodeURIComponent(code) + "&select=owner,active&limit=1", { headers: headers });
  var rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) return null;
  if (rows[0].active === false) return { closed: true };
  return { owner: rows[0].owner };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  if (rateLimited("fi:" + clientIp(req), 60, 5 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var code = String(b.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) { res.status(200).json({ ok: false, error: "bad_code" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    var oc = await ownerByCode(base, headers, code);
    if (!oc) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    if (oc.closed) { res.status(200).json({ ok: false, error: "closed" }); return; }
    var owner = oc.owner;

    if (b.action === "info") {
      // Nombre de la empresa: lo tomamos de la marca del reclutador si dejó alguna búsqueda/aviso con brand_name.
      var company = "";
      try {
        var jr = await fetch(base + "/rest/v1/job_posts?owner=eq." + encodeURIComponent(owner) + "&select=brand_name&brand_name=neq.&limit=1", { headers: headers });
        var jrows = await jr.json();
        if (Array.isArray(jrows) && jrows[0] && jrows[0].brand_name) company = String(jrows[0].brand_name);
      } catch (e) {}
      res.status(200).json({ ok: true, company: company });
      return;
    }

    if (b.action === "punch") {
      var type = String(b.type || "").trim().toLowerCase();
      if (type !== "entrada" && type !== "salida") { res.status(200).json({ ok: false, error: "bad_type" }); return; }
      var first = String(b.first_name || "").slice(0, 120).trim();
      var last = String(b.last_name || "").slice(0, 120).trim();
      var dni = String(b.dni || b.legajo_number || "").slice(0, 60).trim();
      var dniDigits = dni.replace(/\D/g, "");
      if (!dniDigits) { res.status(200).json({ ok: false, error: "no_dni" }); return; }
      if (!first && !last) { res.status(200).json({ ok: false, error: "no_name" }); return; }

      // Buscar el empleado por N° de DOCUMENTO (DNI) dentro del dueño del fichador.
      // Comparamos solo los dígitos (así "30.123.456" y "30123456" matchean).
      var emp = null;
      try {
        var er = await fetch(base + "/rest/v1/employees?owner=eq." + encodeURIComponent(owner) + "&select=id,first_name,last_name,status,dni,legajo_number&limit=5000", { headers: headers });
        var erows = await er.json();
        if (Array.isArray(erows)) {
          // 1) Por N° de documento (DNI), comparando sólo dígitos.
          for (var i = 0; i < erows.length; i++) {
            var ed = String(erows[i].dni || "").replace(/\D/g, "");
            if (ed && ed === dniDigits) { emp = erows[i]; break; }
          }
          // 2) Fallback: por N° de legajo (por si cargaron el legajo en lugar del DNI).
          if (!emp) {
            var raw = dni.trim().toLowerCase();
            for (var k = 0; k < erows.length; k++) {
              var lg = String(erows[k].legajo_number || "").trim();
              if (!lg) continue;
              var lgd = lg.replace(/\D/g, "");
              if (lg.toLowerCase() === raw || (lgd && lgd === dniDigits)) { emp = erows[k]; break; }
            }
          }
        }
      } catch (e) {}

      var nameEntered = (first + " " + last).trim();
      var photo = String(b.photo_url || "").slice(0, 1000);
      var lat = (typeof b.lat === "number") ? b.lat : null;
      var lng = (typeof b.lng === "number") ? b.lng : null;
      var acc = (typeof b.accuracy === "number") ? b.accuracy : null;

      var row = {
        owner: owner, employee_id: emp ? emp.id : null, legajo_number: emp ? (emp.legajo_number || "") : "", dni: dni, name_entered: nameEntered,
        type: type, photo_url: photo || null, lat: lat, lng: lng, accuracy: acc, source: "fichador"
      };
      // Reintento resiliente: si la columna "dni" todavía no existe, guardamos sin ella.
      var rowNoDni = Object.assign({}, row); delete rowNoDni.dni;
      var ins = await fetch(base + "/rest/v1/attendance", {
        method: "POST", headers: Object.assign({}, headers, { Prefer: "return=representation" }), body: JSON.stringify(row)
      });
      var jj = await ins.json();
      if (!ins.ok) {
        ins = await fetch(base + "/rest/v1/attendance", {
          method: "POST", headers: Object.assign({}, headers, { Prefer: "return=representation" }), body: JSON.stringify(rowNoDni)
        });
        jj = await ins.json();
      }
      if (!ins.ok || !Array.isArray(jj) || !jj[0]) { var t = JSON.stringify(jj); res.status(200).json({ ok: false, error: "insert_failed", detail: String(t).slice(0, 200) }); return; }
      var saved = jj[0];
      res.status(200).json({
        ok: true, type: type, punched_at: saved.punched_at || null,
        matched: !!emp, employee_name: emp ? ((emp.first_name || "") + " " + (emp.last_name || "")).trim() : nameEntered
      });
      return;
    }

    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
