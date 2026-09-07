// Función serverless (Vercel) — CRON. Envío automático de las encuestas de clima.
// La llama Vercel una vez por día (ver "crons" en vercel.json). Busca las encuestas
// activas con envío automático cuyo próximo envío ya venció, le manda el link a cada
// destinatario por mail (Brevo) y deja programado el envío siguiente según la
// frecuencia elegida: mensual, trimestral o anual.
//
// Variables de entorno en Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  -> base de datos
//   BREVO_API_KEY, BREVO_SENDER              -> envío de mails (mismo que /api/notify)
//   BREVO_SENDER_NAME (opcional)
//   PUBLIC_BASE_URL   (opcional) -> base del link público. Por defecto, la URL de Vercel.
//   CRON_SECRET       (opcional) -> si está definida, se exige en el header Authorization.

var MAX_SURVEYS = 20;      // encuestas procesadas por corrida
var MAX_RECIPIENTS = 300;  // destinatarios por encuesta y por corrida
var CONCURRENCY = 8;

function isEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim()); }
function pad2(n) { return ("0" + n).slice(-2); }

/* Etiqueta de la ronda según la frecuencia: 2026-09 · 2026-T3 · 2026 */
function roundKey(date, freq) {
  var y = date.getUTCFullYear(), m = date.getUTCMonth() + 1;
  if (freq === "anual") return String(y);
  if (freq === "trimestral") return y + "-T" + Math.ceil(m / 3);
  if (freq === "mensual") return y + "-" + pad2(m);
  return y + "-" + pad2(m) + "-" + pad2(date.getUTCDate());
}
/* Próximo envío según la frecuencia (mantiene la hora del envío anterior). */
function nextSendAt(from, freq) {
  var d = new Date(from.getTime());
  if (freq === "mensual") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (freq === "trimestral") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (freq === "anual") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else return null;
  return d.toISOString();
}
function surveyLink(base, code) {
  return String(base || "").replace(/[?#].*$/, "").replace(/\/*$/, "/") + "?enc=" + encodeURIComponent(code);
}
function inviteMessage(survey, link) {
  var brand = survey.brand_name ? String(survey.brand_name).trim() : "";
  return "Hola,\n\n" +
    (brand ? (brand + " está haciendo su encuesta de clima laboral.\n\n") : "Estamos haciendo la encuesta de clima laboral.\n\n") +
    "Es " + (survey.anonymous === false ? "breve" : "anónima") + " y te lleva unos pocos minutos:\n" + link + "\n\n" +
    (survey.anonymous === false ? "" : "Nadie puede saber quién respondió qué: los resultados se ven siempre agrupados.\n\n") +
    "Tu opinión sirve para tomar decisiones concretas. ¡Gracias por participar!";
}

async function sendMail(apiKey, sender, senderName, to, subject, message) {
  try {
    var r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: sender, name: senderName },
        to: [{ email: to }],
        subject: subject,
        textContent: message
      })
    });
    return r.status === 201 || r.ok;
  } catch (e) { return false; }
}

/* Manda de a tandas para no colgar la función con listas largas. */
async function sendAll(apiKey, sender, senderName, list, subject, message) {
  var sent = 0, failed = 0;
  for (var i = 0; i < list.length; i += CONCURRENCY) {
    var chunk = list.slice(i, i + CONCURRENCY);
    var results = await Promise.all(chunk.map(function (to) {
      return sendMail(apiKey, sender, senderName, to, subject, message);
    }));
    results.forEach(function (ok) { if (ok) sent++; else failed++; });
  }
  return { sent: sent, failed: failed };
}

module.exports = async function handler(req, res) {
  var secret = process.env.CRON_SECRET;
  if (secret) {
    var auth = String(req.headers.authorization || "");
    if (auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
  }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var apiKey = process.env.BREVO_API_KEY;
  var sender = process.env.BREVO_SENDER;
  var senderName = process.env.BREVO_SENDER_NAME || "Encuesta de clima";
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  if (!apiKey || !sender) { res.status(200).json({ ok: false, error: "no_mail_config" }); return; }

  var base = url.replace(/\/+$/, "");
  var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  var publicBase = process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? ("https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL) : "https://entrevistas-two.vercel.app/");

  try {
    var now = new Date();
    var q = "/rest/v1/climate_surveys?select=*&status=eq.activa&auto_send=is.true" +
      "&next_send_at=not.is.null&next_send_at=lte." + encodeURIComponent(now.toISOString()) +
      "&order=next_send_at.asc&limit=" + MAX_SURVEYS;
    var r = await fetch(base + q, { headers: headers });
    var due = await r.json();
    if (!Array.isArray(due)) { res.status(200).json({ ok: false, error: "query_failed" }); return; }

    var report = [];
    for (var i = 0; i < due.length; i++) {
      var s = due[i];
      var recipients = Array.isArray(s.recipients) ? s.recipients : [];
      var emails = [];
      recipients.forEach(function (p) {
        var em = (p && typeof p === "object") ? p.email : p;
        em = String(em || "").trim().toLowerCase();
        if (isEmail(em) && emails.indexOf(em) < 0) emails.push(em);
      });
      emails = emails.slice(0, MAX_RECIPIENTS);

      var round = roundKey(now, s.frequency);
      var link = surveyLink(publicBase, s.code);
      var subject = "Encuesta de clima" + (s.brand_name ? (" · " + s.brand_name) : "");
      var out = { sent: 0, failed: 0 };
      if (emails.length) out = await sendAll(apiKey, sender, senderName, emails, subject, inviteMessage(s, link));

      var patch = {
        current_round: round,
        last_sent_at: now.toISOString(),
        next_send_at: nextSendAt(new Date(s.next_send_at || now), s.frequency)
      };
      // "Única vez": se envía una sola vez y se apaga el envío automático.
      if (!patch.next_send_at) patch.auto_send = false;

      await fetch(base + "/rest/v1/climate_surveys?id=eq." + encodeURIComponent(s.id), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(patch)
      });

      report.push({ id: s.id, title: s.title, round: round, sent: out.sent, failed: out.failed, next: patch.next_send_at });
    }

    res.status(200).json({ ok: true, processed: report.length, surveys: report });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
