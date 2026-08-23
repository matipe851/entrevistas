// Función serverless (Vercel) — guarda la entrevista completada en Supabase.
// Usa la SERVICE_ROLE key (secreta, solo del lado del servidor) para escribir en la base,
// validando el código y que la entrevista siga pendiente (un solo uso real).
// Variables de entorno necesarias en Vercel: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.

// --- Anti-abuso simple en memoria (por instancia del servidor) ---
// No es un rate-limit distribuido perfecto, pero frena a un atacante que martilla
// una misma instancia y evita que se dispare el gasto. Sin dependencias ni costo.
var _rlStore = global.__voz_rl || (global.__voz_rl = {});
function rateLimited(key, max, windowMs) {
  var now = Date.now();
  var arr = (_rlStore[key] || []).filter(function (t) { return now - t < windowMs; });
  arr.push(now);
  _rlStore[key] = arr;
  if (Math.random() < 0.02) { // limpieza ocasional para no crecer sin límite
    for (var k in _rlStore) {
      var a = _rlStore[k];
      if (!a.length || now - a[a.length - 1] > windowMs) delete _rlStore[k];
    }
  }
  return arr.length > max;
}
function clientIp(req) {
  var xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.headers["x-real-ip"] || "unknown";
}
function str(v, max) { return (v == null ? "" : String(v)).slice(0, max || 500); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }

  // Rate limit: máx. 20 envíos cada 10 minutos por IP.
  if (rateLimited("sub:" + clientIp(req), 20, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    if (!b.id || !b.code) { res.status(200).json({ ok: false, error: "bad_request" }); return; }

    // Validación de entrada.
    var id = str(b.id, 100);
    var code = str(b.code, 16);
    if (!/^[0-9a-fA-F-]{6,60}$/.test(id)) { res.status(200).json({ ok: false, error: "bad_id" }); return; }
    var candName = b.candidateName ? str(b.candidateName, 120) : null;
    var candEmail = b.candidateEmail ? str(b.candidateEmail, 160) : null;
    if (candEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candEmail)) { res.status(200).json({ ok: false, error: "bad_email" }); return; }
    var score = (typeof b.score === "number" && isFinite(b.score) && b.score >= 0 && b.score <= 10) ? b.score : null;
    var recommendation = b.recommendation ? str(b.recommendation, 60) : null;
    // Limitar tamaño de estructuras grandes para evitar payloads maliciosos.
    var report = b.report || null;
    if (report && JSON.stringify(report).length > 60000) { res.status(200).json({ ok: false, error: "report_too_big" }); return; }
    var answers = Array.isArray(b.answers) ? b.answers.slice(0, 20) : (b.answers || null);
    var audioUrls = Array.isArray(b.audioUrls) ? b.audioUrls.slice(0, 20).map(function (u) { return str(u, 400); }) : null;

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    // 1) Traer la entrevista para validar código y estado.
    var getR = await fetch(base + "/rest/v1/interviews?id=eq." + encodeURIComponent(id) + "&select=id,code,status", { headers: headers });
    var rows = await getR.json();
    if (!Array.isArray(rows) || !rows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var iv = rows[0];
    if (String(iv.code || "").toUpperCase() !== code.toUpperCase()) { res.status(200).json({ ok: false, error: "bad_code" }); return; }
    if (iv.status === "completed") { res.status(200).json({ ok: false, error: "already_done" }); return; }

    // 2) Actualizar con los resultados.
    var patch = {
      status: "completed",
      candidate_name: candName,
      candidate_email: candEmail,
      score: score,
      recommendation: recommendation,
      report: report,
      answers: answers,
      audio_urls: audioUrls,
      completed_at: new Date().toISOString()
    };
    var upR = await fetch(base + "/rest/v1/interviews?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: Object.assign({}, headers, { Prefer: "return=minimal" }),
      body: JSON.stringify(patch)
    });
    if (!upR.ok) { var t = await upR.text(); res.status(200).json({ ok: false, error: "update_failed", detail: t.slice(0, 200) }); return; }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
