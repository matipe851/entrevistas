// Función serverless (Vercel) — guarda la entrevista completada en Supabase.
// Usa la SERVICE_ROLE key (secreta, solo del lado del servidor) para escribir en la base,
// validando el código y que la entrevista siga pendiente (un solo uso real).
// Variables de entorno necesarias en Vercel: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    if (!b.id || !b.code) { res.status(200).json({ ok: false, error: "bad_request" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    // 1) Traer la entrevista para validar código y estado.
    var getR = await fetch(base + "/rest/v1/interviews?id=eq." + encodeURIComponent(b.id) + "&select=id,code,status", { headers: headers });
    var rows = await getR.json();
    if (!Array.isArray(rows) || !rows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var iv = rows[0];
    if (String(iv.code || "").toUpperCase() !== String(b.code || "").toUpperCase()) { res.status(200).json({ ok: false, error: "bad_code" }); return; }
    if (iv.status === "completed") { res.status(200).json({ ok: false, error: "already_done" }); return; }

    // 2) Actualizar con los resultados.
    var patch = {
      status: "completed",
      candidate_name: b.candidateName || null,
      candidate_email: b.candidateEmail || null,
      score: (typeof b.score === "number" ? b.score : null),
      recommendation: b.recommendation || null,
      report: b.report || null,
      answers: b.answers || null,
      audio_urls: b.audioUrls || null,
      completed_at: new Date().toISOString()
    };
    var upR = await fetch(base + "/rest/v1/interviews?id=eq." + encodeURIComponent(b.id), {
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
