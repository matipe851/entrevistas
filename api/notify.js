// Función serverless (Vercel) — envía los resultados de la entrevista por email,
// a la dirección que cargó el reclutador (a diferencia de Web3Forms, que solo
// enviaba al dueño de la cuenta). Usa Brevo (https://brevo.com), gratis: 300 mails/día.
// Variables de entorno en Vercel:
//   BREVO_API_KEY  -> tu API key de Brevo (SMTP & API > API Keys)
//   BREVO_SENDER   -> un email verificado como remitente en Brevo (ej: tu Gmail)
//   BREVO_SENDER_NAME (opcional) -> nombre que se muestra como remitente

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var apiKey = process.env.BREVO_API_KEY;
  var sender = process.env.BREVO_SENDER;
  var senderName = process.env.BREVO_SENDER_NAME || "voz. entrevistas";
  if (!apiKey || !sender) { res.status(200).json({ ok: false, error: "no_config" }); return; }

  // Anti-abuso: máx. 30 envíos cada 10 minutos por IP.
  if (rateLimited("mail:" + clientIp(req), 30, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};

    var to = String(b.to || "").trim();
    if (!isEmail(to)) { res.status(200).json({ ok: false, error: "bad_recipient" }); return; }
    var subject = String(b.subject || "Resultados de entrevista").slice(0, 200);
    var message = String(b.message || "").slice(0, 40000);
    var replyTo = isEmail(b.replyTo) ? String(b.replyTo).trim() : "";

    var payload = {
      sender: { email: sender, name: senderName },
      to: [{ email: to }],
      subject: subject,
      textContent: message || "(sin contenido)"
    };
    if (replyTo) payload.replyTo = { email: replyTo };

    var r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify(payload)
    });
    if (r.status === 201 || r.ok) { res.status(200).json({ ok: true }); return; }
    var errText = "";
    try { var ej = await r.json(); errText = (ej && (ej.message || ej.code)) || ""; } catch (e) { errText = "HTTP " + r.status; }
    res.status(200).json({ ok: false, error: "brevo_error", detail: String(errText).slice(0, 300) });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
