// Función serverless (Vercel) — PÚBLICA. Recibe la postulación (CV) de una
// persona a un aviso del portal y la guarda EN EL REPOSITORIO DEL RECLUTADOR
// dueño del aviso, dentro de la carpeta con el nombre del puesto.
// El postulante NO tiene sesión, por eso se usa la SERVICE ROLE del lado del
// servidor (respetando: cada CV queda como propiedad del reclutador correcto).
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

  // Límite: máx. 30 postulaciones cada 10 min por IP.
  if (rateLimited("ja:" + clientIp(req), 30, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var code = String(b.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) { res.status(200).json({ ok: false, error: "bad_code" }); return; }
    var name = String(b.candidate_name || "").slice(0, 200);
    var email = String(b.candidate_email || "").slice(0, 200);
    var cvText = String(b.cv_text || "").slice(0, 60000);
    var cvUrl = String(b.cv_url || "").slice(0, 1000);
    var fileName = String(b.file_name || "").slice(0, 300);
    if (!cvText || cvText.trim().length < 20) { res.status(200).json({ ok: false, error: "no_cv_text" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    // 1) Resolver el aviso -> dueño + puesto (carpeta).
    var jr = await fetch(base + "/rest/v1/job_posts?code=eq." + encodeURIComponent(code) + "&select=id,owner,position,active,applicants&limit=1", { headers: headers });
    var jrows = await jr.json();
    if (!Array.isArray(jrows) || !jrows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var job = jrows[0];
    if (job.active === false) { res.status(200).json({ ok: false, error: "closed" }); return; }
    var folder = job.position ? String(job.position) : null;

    // 2) Asegurar la carpeta del puesto (best-effort; ignora duplicados).
    if (folder) {
      try {
        await fetch(base + "/rest/v1/cv_folders", {
          method: "POST",
          headers: Object.assign({}, headers, { Prefer: "resolution=ignore-duplicates,return=minimal" }),
          body: JSON.stringify({ recruiter_id: job.owner, name: folder })
        });
      } catch (e) {}
    }

    // 3) Insertar el CV en el repositorio del reclutador, en la carpeta del puesto.
    var cvRow = { owner: job.owner, candidate_name: name || null, candidate_email: email || null, file_name: fileName || null, cv_text: cvText, cv_url: cvUrl || null, folder: folder };
    var ins = await fetch(base + "/rest/v1/cvs", {
      method: "POST", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(cvRow)
    });
    if (!ins.ok) {
      // Fallback resiliente: si la columna folder no existe todavía, reintentamos sin ella.
      var cvRow2 = { owner: job.owner, candidate_name: name || null, candidate_email: email || null, file_name: fileName || null, cv_text: cvText, cv_url: cvUrl || null };
      var ins2 = await fetch(base + "/rest/v1/cvs", {
        method: "POST", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(cvRow2)
      });
      if (!ins2.ok) { var t = await ins2.text(); res.status(200).json({ ok: false, error: "insert_failed", detail: t.slice(0, 200) }); return; }
    }

    // 4) Sumar 1 al contador de postulantes (best-effort).
    try {
      var cur = (typeof job.applicants === "number") ? job.applicants : 0;
      await fetch(base + "/rest/v1/job_posts?code=eq." + encodeURIComponent(code), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify({ applicants: cur + 1 })
      });
    } catch (e) {}

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
