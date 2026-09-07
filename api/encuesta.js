// Función serverless (Vercel) — PÚBLICA. Encuestas de clima (Módulo 3).
//   action "get":    devuelve la encuesta por su código (sólo si está activa).
//   action "submit": guarda una respuesta ANÓNIMA (no guarda email ni nombre).
// La persona que responde NO tiene sesión: se usa la SERVICE ROLE del lado del servidor.
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
  if (rateLimited("enc:" + clientIp(req), 60, 5 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};

    var code = String(b.code || "").trim();
    if (!/^[A-Za-z0-9]{4,24}$/.test(code)) { res.status(200).json({ ok: false, error: "bad_code" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    var sel = "id,title,intro,questions,scale,anonymous,ask_area,status,code,current_round,brand_name";
    var r = await fetch(base + "/rest/v1/climate_surveys?code=eq." + encodeURIComponent(code) + "&select=" + sel + "&limit=1", { headers: headers });
    var rows = await r.json();
    if (!Array.isArray(rows) || !rows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var s = rows[0];
    if (s.status === "cerrada") { res.status(200).json({ ok: false, error: "closed" }); return; }
    if (s.status !== "activa") { res.status(200).json({ ok: false, error: "not_open" }); return; }

    if (b.action === "get") {
      res.status(200).json({
        ok: true,
        survey: {
          title: s.title || "Encuesta de clima",
          intro: s.intro || "",
          questions: Array.isArray(s.questions) ? s.questions : [],
          scale: s.scale || 5,
          anonymous: s.anonymous !== false,
          ask_area: s.ask_area !== false,
          brand_name: s.brand_name || "",
          round: s.current_round || ""
        }
      });
      return;
    }

    if (b.action === "submit") {
      var qs = Array.isArray(s.questions) ? s.questions : [];
      var byId = {};
      qs.forEach(function (q) { if (q && q.id) byId[q.id] = q; });

      var incoming = (b.answers && typeof b.answers === "object") ? b.answers : {};
      var clean = {};
      var answered = 0;
      Object.keys(incoming).slice(0, 200).forEach(function (qid) {
        var q = byId[qid];
        if (!q) return;
        var v = incoming[qid];
        if (v === null || v === undefined || v === "") return;
        if (q.type === "text") {
          var txt = String(v).trim().slice(0, 2000);
          if (txt) { clean[qid] = txt; answered++; }
          return;
        }
        var n = Number(v);
        if (!isFinite(n)) return;
        var max = (q.type === "enps") ? 10 : (s.scale || 5);
        var min = (q.type === "enps") ? 0 : 1;
        if (n < min || n > max) return;
        clean[qid] = Math.round(n);
        answered++;
      });
      if (!answered) { res.status(200).json({ ok: false, error: "empty" }); return; }

      var row = {
        survey_id: s.id,
        round: s.current_round || null,
        area: String(b.area || "").slice(0, 120).trim() || null,
        answers: clean,
        comments: String(b.comments || "").slice(0, 4000).trim() || null
      };
      var ins = await fetch(base + "/rest/v1/climate_responses", {
        method: "POST", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(row)
      });
      if (!ins.ok) {
        var det = "";
        try { det = JSON.stringify(await ins.json()); } catch (e) { det = "HTTP " + ins.status; }
        res.status(200).json({ ok: false, error: "insert_failed", detail: String(det).slice(0, 200) });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
