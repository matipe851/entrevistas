// Función serverless (Vercel) — envío MASIVO de una encuesta de clima.
// La llama el reclutador desde la app ("Enviar ahora"). Se hace del lado del servidor
// para poder mandarle a toda la empresa de una sola vez (el envío uno por uno desde
// el navegador choca con los límites de /api/notify).
//
// Verifica el token del usuario contra Supabase y que la encuesta sea suya.
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                       BREVO_API_KEY, BREVO_SENDER, BREVO_SENDER_NAME (opcional).

var MAX_RECIPIENTS = 300;
var CONCURRENCY = 8;

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
function isEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim()); }
function pad2(n) { return ("0" + n).slice(-2); }
function roundKey(date, freq) {
  var y = date.getUTCFullYear(), m = date.getUTCMonth() + 1;
  if (freq === "anual") return String(y);
  if (freq === "trimestral") return y + "-T" + Math.ceil(m / 3);
  if (freq === "mensual") return y + "-" + pad2(m);
  return y + "-" + pad2(m) + "-" + pad2(date.getUTCDate());
}
function surveyLink(base, code) {
  return String(base || "").replace(/[?#].*$/, "").replace(/\/*$/, "/") + "?enc=" + encodeURIComponent(code);
}

async function callerUser(base, key, token) {
  try {
    var r = await fetch(base + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
async function sendMail(apiKey, sender, senderName, replyTo, to, subject, message) {
  try {
    var payload = {
      sender: { email: sender, name: senderName },
      to: [{ email: to }],
      subject: subject,
      textContent: message
    };
    if (replyTo && isEmail(replyTo)) payload.replyTo = { email: replyTo };
    var r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    });
    return r.status === 201 || r.ok;
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var apiKey = process.env.BREVO_API_KEY;
  var sender = process.env.BREVO_SENDER;
  var senderName = process.env.BREVO_SENDER_NAME || "Encuesta de clima";
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  if (!apiKey || !sender) { res.status(200).json({ ok: false, error: "no_mail_config" }); return; }
  if (rateLimited("encsend:" + clientIp(req), 12, 10 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    if (!b.token) { res.status(200).json({ ok: false, error: "no_token" }); return; }
    var surveyId = String(b.surveyId || "").trim();
    if (!surveyId) { res.status(200).json({ ok: false, error: "no_survey" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    var user = await callerUser(base, key, b.token);
    if (!user || !user.id) { res.status(200).json({ ok: false, error: "unauthorized" }); return; }

    var r = await fetch(base + "/rest/v1/climate_surveys?id=eq." + encodeURIComponent(surveyId) + "&select=*&limit=1", { headers: headers });
    var rows = await r.json();
    if (!Array.isArray(rows) || !rows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var s = rows[0];
    if (s.owner && s.owner !== user.id) { res.status(200).json({ ok: false, error: "not_owner" }); return; }
    if (s.status !== "activa") { res.status(200).json({ ok: false, error: "not_active" }); return; }
    if (!s.code) { res.status(200).json({ ok: false, error: "no_code" }); return; }

    var recipients = Array.isArray(s.recipients) ? s.recipients : [];
    var emails = [];
    recipients.forEach(function (p) {
      var em = (p && typeof p === "object") ? p.email : p;
      em = String(em || "").trim().toLowerCase();
      if (isEmail(em) && emails.indexOf(em) < 0) emails.push(em);
    });
    if (!emails.length) { res.status(200).json({ ok: false, error: "no_recipients" }); return; }
    var skipped = Math.max(0, emails.length - MAX_RECIPIENTS);
    emails = emails.slice(0, MAX_RECIPIENTS);

    var publicBase = String(b.baseUrl || "").trim() || process.env.PUBLIC_BASE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? ("https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL) : "https://entrevistas-two.vercel.app/");
    if (!/^https:\/\//.test(publicBase)) publicBase = "https://entrevistas-two.vercel.app/";
    var link = surveyLink(publicBase, s.code);

    var brand = s.brand_name ? String(s.brand_name).trim() : "";
    var subject = String(b.subject || ("Encuesta de clima" + (brand ? (" · " + brand) : ""))).slice(0, 200);
    var message = String(b.message || "").slice(0, 20000) ||
      ("Hola,\n\n" +
       (brand ? (brand + " está haciendo su encuesta de clima laboral.\n\n") : "Estamos haciendo la encuesta de clima laboral.\n\n") +
       "Es " + (s.anonymous === false ? "breve" : "anónima") + " y te lleva unos pocos minutos:\n" + link + "\n\n" +
       (s.anonymous === false ? "" : "Nadie puede saber quién respondió qué: los resultados se ven siempre agrupados.\n\n") +
       "Tu opinión sirve para tomar decisiones concretas. ¡Gracias por participar!");
    if (message.indexOf(link) < 0) message += "\n\n" + link;
    var replyTo = isEmail(user.email) ? user.email : "";

    var sent = 0, failed = 0;
    for (var i = 0; i < emails.length; i += CONCURRENCY) {
      var chunk = emails.slice(i, i + CONCURRENCY);
      var results = await Promise.all(chunk.map(function (to) {
        return sendMail(apiKey, sender, senderName, replyTo, to, subject, message);
      }));
      results.forEach(function (ok) { if (ok) sent++; else failed++; });
    }

    var now = new Date();
    var round = roundKey(now, s.frequency);
    await fetch(base + "/rest/v1/climate_surveys?id=eq." + encodeURIComponent(s.id), {
      method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }),
      body: JSON.stringify({ current_round: round, last_sent_at: now.toISOString() })
    });

    res.status(200).json({ ok: true, total: emails.length, sent: sent, failed: failed, skipped: skipped, round: round, link: link });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
