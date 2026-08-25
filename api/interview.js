// Función serverless (Vercel) — devuelve una entrevista por su CÓDIGO, para que el
// enlace que recibe el candidato sea CORTO (solo el código) en vez de llevar todas
// las preguntas embebidas. Usa la SERVICE_ROLE key del lado del servidor y devuelve
// SOLO los campos necesarios para rendir la entrevista (nunca respuestas ni evaluación).
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

  if (rateLimited("iv:" + clientIp(req), 80, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var code = String(b.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) { res.status(200).json({ ok: false, error: "bad_code" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key };
    var sel = "id,code,position,company,focus,level,language,questions,brand_name,brand_logo,status";
    var r = await fetch(base + "/rest/v1/interviews?code=eq." + encodeURIComponent(code) + "&select=" + sel + "&limit=1", { headers: headers });
    var rows = await r.json();
    if (!Array.isArray(rows) || !rows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var row = rows[0];

    var inv = {
      v: 1,
      code: row.code,
      id: row.id,
      position: row.position || "",
      company: row.company || "",
      focus: row.focus || "",
      level: row.level || "Semi-Senior",
      language: row.language || "es",
      followups: false,
      brandName: row.brand_name || "",
      brandLogo: row.brand_logo || "",
      status: row.status || "pending",
      questions: Array.isArray(row.questions) ? row.questions : []
    };
    if (!inv.questions.length) { res.status(200).json({ ok: false, error: "no_questions" }); return; }
    res.status(200).json({ ok: true, interview: inv });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
