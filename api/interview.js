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
    // Traemos SOLO campos públicos de la entrevista (nunca answers/report/score/audio).
    var selBase = "id,code,position,company,focus,level,language,questions,brand_name,brand_logo,status,created_at";
    // Intentamos traer las columnas opcionales (valid_days, followups). Si alguna no existe
    // todavía, reintentamos sin ellas para no romper la carga de la entrevista.
    async function fetchRow(withOptional) {
      var sel = selBase + (withOptional ? ",valid_days,followups" : "");
      var rr = await fetch(base + "/rest/v1/interviews?code=eq." + encodeURIComponent(code) + "&select=" + sel + "&limit=1", { headers: headers });
      var jj = await rr.json();
      return { ok: rr.ok, rows: jj };
    }
    var got = await fetchRow(true);
    if (!got.ok || !Array.isArray(got.rows)) got = await fetchRow(false); // fallback si columnas opcionales no existen
    var rows = got.rows;
    if (!Array.isArray(rows) || !rows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var row = rows[0];

    // Vencimiento configurable: valid_days por entrevista. 0 = sin vencimiento; null/ausente = 3 días.
    var vd = row.valid_days;
    var days = (vd === 0) ? 0 : ((typeof vd === "number" && vd > 0) ? vd : 3);
    if (days > 0 && row.created_at) {
      var createdMs = Date.parse(row.created_at);
      if (!isNaN(createdMs) && (Date.now() - createdMs) > days * 24 * 60 * 60 * 1000) {
        res.status(200).json({ ok: false, error: "expired" }); return;
      }
    }

    var inv = {
      v: 1,
      code: row.code,
      id: row.id,
      position: row.position || "",
      company: row.company || "",
      focus: row.focus || "",
      level: row.level || "Semi-Senior",
      language: row.language || "es",
      followups: !!row.followups,
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
