// Función serverless (Vercel) — TODO lo de las encuestas de clima (Módulo 3), en un
// solo archivo. Vercel cuenta una función por archivo dentro de /api y el plan Hobby
// admite hasta 12, así que las cuatro operaciones viajan por el mismo endpoint y se
// eligen con "action":
//
//   action "get"    (público)      -> devuelve la encuesta por su código, si está activa.
//   action "submit" (público)      -> guarda una respuesta ANÓNIMA (no guarda quién fue).
//   action "send"   (con sesión)   -> envío masivo por mail a los destinatarios.
//   action "announce" (con sesión) -> manda un anuncio de comunicación interna
//                                     (Módulo 3, área 6) a su lista de destinatarios.
//   action "cron"   (Vercel/cron)  -> manda las encuestas programadas que ya vencieron
//                                     y deja agendado el envío siguiente.
//
// Quien responde NO tiene sesión: se usa la SERVICE ROLE del lado del servidor.
// Variables de entorno en Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  -> base de datos
//   BREVO_API_KEY, BREVO_SENDER              -> envío de mails (igual que /api/notify)
//   BREVO_SENDER_NAME (opcional)
//   PUBLIC_BASE_URL   (opcional) -> base del link público
//   CRON_SECRET       (opcional) -> si está, se exige en el header Authorization del cron

var MAX_SURVEYS = 20;      // encuestas procesadas por corrida del cron
var MAX_RECIPIENTS = 300;  // destinatarios por encuesta y por envío
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
function defaultBase() {
  return process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? ("https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL) : "https://entrevistas-two.vercel.app/");
}
function inviteMessage(survey, link) {
  var brand = survey.brand_name ? String(survey.brand_name).trim() : "";
  return "Hola,\n\n" +
    (brand ? (brand + " está haciendo su encuesta de clima laboral.\n\n") : "Estamos haciendo la encuesta de clima laboral.\n\n") +
    "Es " + (survey.anonymous === false ? "breve" : "anónima") + " y te lleva unos pocos minutos:\n" + link + "\n\n" +
    (survey.anonymous === false ? "" : "Nadie puede saber quién respondió qué: los resultados se ven siempre agrupados.\n\n") +
    "Tu opinión sirve para tomar decisiones concretas. ¡Gracias por participar!";
}
/* Destinatarios normalizados, sin repetidos ni direcciones inválidas. */
function recipientEmails(survey) {
  var out = [];
  (Array.isArray(survey && survey.recipients) ? survey.recipients : []).forEach(function (p) {
    var em = (p && typeof p === "object") ? p.email : p;
    em = String(em || "").trim().toLowerCase();
    if (isEmail(em) && out.indexOf(em) < 0) out.push(em);
  });
  return out;
}
/* ---- Marca de la empresa en el mail ----
   El cuerpo se escribe en texto plano; acá lo envolvemos en un HTML sobrio con el
   logo y el nombre de la empresa arriba. El texto plano viaja igual como alternativa
   (para quien lea con las imágenes bloqueadas o en un cliente viejo). */
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
// Convierte el texto plano en HTML: escapa, hace clickeables los links y respeta los saltos.
function textToHtml(s) {
  var safe = escHtml(s);
  safe = safe.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
    return '<a href="' + u + '" style="color:#2563EB;text-decoration:underline;word-break:break-all">' + u + "</a>";
  });
  return safe.replace(/\r?\n/g, "<br>");
}
function brandedHtml(brandName, brandLogo, message) {
  var name = String(brandName || "").trim();
  var logo = String(brandLogo || "").trim();
  if (!/^https:\/\//.test(logo)) logo = ""; // sólo logos servidos por https
  var head = "";
  if (logo || name) {
    head =
      '<tr><td style="padding:20px 26px;border-bottom:1px solid #eef2f8">' +
        (logo ? '<img src="' + escHtml(logo) + '" alt="' + escHtml(name) + '" style="max-height:44px;max-width:180px;display:block;border:0">' : "") +
        (name ? '<div style="font-size:15px;font-weight:700;color:#16233a;' + (logo ? "margin-top:10px" : "") + '">' + escHtml(name) + "</div>" : "") +
      "</td></tr>";
  }
  var foot = name
    ? '<tr><td style="padding:14px 26px;border-top:1px solid #eef2f8;font-size:11.5px;color:#5E6C86">Enviado por ' + escHtml(name) + "</td></tr>"
    : "";
  return '<div style="margin:0;padding:24px 12px;background:#F1F6FD">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;width:100%;background:#ffffff;border:1px solid #e3e9f2;border-radius:14px;border-collapse:separate;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
      head +
      '<tr><td style="padding:24px 26px;font-size:14px;line-height:1.65;color:#16233a">' + textToHtml(message) + "</td></tr>" +
      foot +
    "</table></div>";
}

async function sendMail(cfg, to, subject, message) {
  try {
    var payload = {
      // Sale a nombre de la empresa que armó la encuesta.
      sender: { email: cfg.sender, name: cfg.brandName || cfg.senderName },
      to: [{ email: to }],
      subject: subject,
      textContent: message,
      htmlContent: brandedHtml(cfg.brandName, cfg.brandLogo, message)
    };
    if (cfg.replyTo && isEmail(cfg.replyTo)) payload.replyTo = { email: cfg.replyTo };
    var r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    });
    return r.status === 201 || r.ok;
  } catch (e) { return false; }
}
/* Manda de a tandas para no colgar la función con listas largas. */
async function sendAll(cfg, list, subject, message) {
  var sent = 0, failed = 0;
  for (var i = 0; i < list.length; i += CONCURRENCY) {
    var chunk = list.slice(i, i + CONCURRENCY);
    var results = await Promise.all(chunk.map(function (to) { return sendMail(cfg, to, subject, message); }));
    results.forEach(function (ok) { if (ok) sent++; else failed++; });
  }
  return { sent: sent, failed: failed };
}
function mailConfig() {
  var apiKey = process.env.BREVO_API_KEY, sender = process.env.BREVO_SENDER;
  if (!apiKey || !sender) return null;
  return { apiKey: apiKey, sender: sender, senderName: process.env.BREVO_SENDER_NAME || "Encuesta de clima", replyTo: "", brandName: "", brandLogo: "" };
}
async function callerUser(base, key, token) {
  try {
    var r = await fetch(base + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }
  var base = url.replace(/\/+$/, "");
  var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

  var b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (!b || typeof b !== "object") b = {};
  var action = String((req.query && req.query.action) || b.action || "").trim();
  // El cron de Vercel entra por GET a /api/encuesta, sin cuerpo: lo reconocemos por su user-agent.
  if (!action && req.method === "GET" && /^vercel-cron/i.test(String(req.headers["user-agent"] || ""))) action = "cron";

  try {
    /* ---------- cron: envío automático de las encuestas programadas ---------- */
    if (action === "cron") {
      var secret = process.env.CRON_SECRET;
      if (secret) {
        if (String(req.headers.authorization || "") !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
      } else if (!/^vercel-cron/i.test(String(req.headers["user-agent"] || ""))) {
        // Sin CRON_SECRET, sólo lo puede disparar el cron de Vercel.
        res.status(401).json({ ok: false, error: "unauthorized" }); return;
      }
      var cfgC = mailConfig();
      if (!cfgC) { res.status(200).json({ ok: false, error: "no_mail_config" }); return; }

      var now = new Date();
      var q = "/rest/v1/climate_surveys?select=*&status=eq.activa&auto_send=is.true" +
        "&next_send_at=not.is.null&next_send_at=lte." + encodeURIComponent(now.toISOString()) +
        "&order=next_send_at.asc&limit=" + MAX_SURVEYS;
      var dueRes = await fetch(base + q, { headers: headers });
      var due = await dueRes.json();
      if (!Array.isArray(due)) { res.status(200).json({ ok: false, error: "query_failed" }); return; }

      var report = [];
      for (var i = 0; i < due.length; i++) {
        var s = due[i];
        var emails = recipientEmails(s).slice(0, MAX_RECIPIENTS);
        var round = roundKey(now, s.frequency);
        var link = surveyLink(defaultBase(), s.code);
        var subject = "Encuesta de clima" + (s.brand_name ? (" · " + s.brand_name) : "");
        var out = { sent: 0, failed: 0 };
        cfgC.brandName = s.brand_name || "";
        cfgC.brandLogo = s.brand_logo || "";
        if (emails.length) out = await sendAll(cfgC, emails, subject, inviteMessage(s, link));

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
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    /* ---------- send: envío masivo pedido por el reclutador ---------- */
    if (action === "send") {
      if (rateLimited("encsend:" + clientIp(req), 12, 10 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }
      var cfg = mailConfig();
      if (!cfg) { res.status(200).json({ ok: false, error: "no_mail_config" }); return; }
      if (!b.token) { res.status(200).json({ ok: false, error: "no_token" }); return; }
      var surveyId = String(b.surveyId || "").trim();
      if (!surveyId) { res.status(200).json({ ok: false, error: "no_survey" }); return; }

      var user = await callerUser(base, key, b.token);
      if (!user || !user.id) { res.status(200).json({ ok: false, error: "unauthorized" }); return; }

      var sr = await fetch(base + "/rest/v1/climate_surveys?id=eq." + encodeURIComponent(surveyId) + "&select=*&limit=1", { headers: headers });
      var srows = await sr.json();
      if (!Array.isArray(srows) || !srows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
      var sv = srows[0];
      if (sv.owner && sv.owner !== user.id) { res.status(200).json({ ok: false, error: "not_owner" }); return; }
      if (sv.status !== "activa") { res.status(200).json({ ok: false, error: "not_active" }); return; }
      if (!sv.code) { res.status(200).json({ ok: false, error: "no_code" }); return; }

      var all = recipientEmails(sv);
      if (!all.length) { res.status(200).json({ ok: false, error: "no_recipients" }); return; }
      var skipped = Math.max(0, all.length - MAX_RECIPIENTS);
      var list = all.slice(0, MAX_RECIPIENTS);

      var pb = String(b.baseUrl || "").trim() || defaultBase();
      if (!/^https:\/\//.test(pb)) pb = defaultBase();
      var slink = surveyLink(pb, sv.code);
      var brand = sv.brand_name ? String(sv.brand_name).trim() : "";
      var ssubject = String(b.subject || ("Encuesta de clima" + (brand ? (" · " + brand) : ""))).slice(0, 200);
      var smessage = String(b.message || "").slice(0, 20000) || inviteMessage(sv, slink);
      if (smessage.indexOf(slink) < 0) smessage += "\n\n" + slink;
      cfg.replyTo = isEmail(user.email) ? user.email : "";
      cfg.brandName = sv.brand_name || "";
      cfg.brandLogo = sv.brand_logo || "";

      var r2 = await sendAll(cfg, list, ssubject, smessage);
      var nowS = new Date();
      var roundS = roundKey(nowS, sv.frequency);
      await fetch(base + "/rest/v1/climate_surveys?id=eq." + encodeURIComponent(sv.id), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }),
        body: JSON.stringify({ current_round: roundS, last_sent_at: nowS.toISOString() })
      });
      res.status(200).json({ ok: true, total: list.length, sent: r2.sent, failed: r2.failed, skipped: skipped, round: roundS, link: slink });
      return;
    }

    /* ---------- announce: anuncio de comunicación interna (Módulo 3, área 6) ----------
       Mismo camino de mail que las encuestas: cambia sólo el contenido. Va acá
       adentro para no sumar un archivo más en /api (Vercel Hobby: 12 funciones). */
    if (action === "announce") {
      if (rateLimited("encann:" + clientIp(req), 12, 10 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }
      var cfgA = mailConfig();
      if (!cfgA) { res.status(200).json({ ok: false, error: "no_mail_config" }); return; }
      if (!b.token) { res.status(200).json({ ok: false, error: "no_token" }); return; }
      var annId = String(b.announcementId || "").trim();
      if (!annId) { res.status(200).json({ ok: false, error: "no_announcement" }); return; }

      var userA = await callerUser(base, key, b.token);
      if (!userA || !userA.id) { res.status(200).json({ ok: false, error: "unauthorized" }); return; }

      var ar = await fetch(base + "/rest/v1/announcements?id=eq." + encodeURIComponent(annId) + "&select=*&limit=1", { headers: headers });
      var arows = await ar.json();
      if (!Array.isArray(arows) || !arows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
      var ann = arows[0];
      if (ann.owner && ann.owner !== userA.id) { res.status(200).json({ ok: false, error: "not_owner" }); return; }

      var allA = recipientEmails(ann);   // misma forma que los destinatarios de una encuesta
      if (!allA.length) { res.status(200).json({ ok: false, error: "no_recipients" }); return; }
      var skippedA = Math.max(0, allA.length - MAX_RECIPIENTS);
      var listA = allA.slice(0, MAX_RECIPIENTS);

      var brandA = ann.brand_name ? String(ann.brand_name).trim() : "";
      var subjectA = String(ann.title || "Novedades").slice(0, 200) + (brandA ? (" · " + brandA) : "");
      var messageA = String(ann.body || "").slice(0, 20000) || String(ann.title || "");
      cfgA.replyTo = isEmail(userA.email) ? userA.email : "";
      cfgA.brandName = ann.brand_name || "";
      cfgA.brandLogo = ann.brand_logo || "";

      var rA = await sendAll(cfgA, listA, subjectA, messageA);
      await fetch(base + "/rest/v1/announcements?id=eq." + encodeURIComponent(ann.id), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "publicado", sent_at: new Date().toISOString(), sent_count: (ann.sent_count || 0) + rA.sent })
      });
      res.status(200).json({ ok: true, total: listA.length, sent: rA.sent, failed: rA.failed, skipped: skippedA });
      return;
    }

    /* ---------- get / submit: la parte pública, sin sesión ---------- */
    if (rateLimited("enc:" + clientIp(req), 60, 5 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }
    var code = String(b.code || "").trim();
    if (!/^[A-Za-z0-9]{4,24}$/.test(code)) { res.status(200).json({ ok: false, error: "bad_code" }); return; }

    var sel = "id,title,intro,questions,scale,anonymous,ask_area,status,code,current_round,brand_name";
    var pr = await fetch(base + "/rest/v1/climate_surveys?code=eq." + encodeURIComponent(code) + "&select=" + sel + "&limit=1", { headers: headers });
    var prows = await pr.json();
    if (!Array.isArray(prows) || !prows[0]) { res.status(200).json({ ok: false, error: "not_found" }); return; }
    var enc = prows[0];
    if (enc.status === "cerrada") { res.status(200).json({ ok: false, error: "closed" }); return; }
    if (enc.status !== "activa") { res.status(200).json({ ok: false, error: "not_open" }); return; }

    if (action === "get") {
      res.status(200).json({
        ok: true,
        survey: {
          title: enc.title || "Encuesta de clima",
          intro: enc.intro || "",
          questions: Array.isArray(enc.questions) ? enc.questions : [],
          scale: enc.scale || 5,
          anonymous: enc.anonymous !== false,
          ask_area: enc.ask_area !== false,
          brand_name: enc.brand_name || "",
          round: enc.current_round || ""
        }
      });
      return;
    }

    if (action === "submit") {
      var qs = Array.isArray(enc.questions) ? enc.questions : [];
      var byId = {};
      qs.forEach(function (q) { if (q && q.id) byId[q.id] = q; });

      var incoming = (b.answers && typeof b.answers === "object") ? b.answers : {};
      var clean = {}, answered = 0;
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
        var max = (q.type === "enps") ? 10 : (enc.scale || 5);
        var min = (q.type === "enps") ? 0 : 1;
        if (n < min || n > max) return;
        clean[qid] = Math.round(n);
        answered++;
      });
      if (!answered) { res.status(200).json({ ok: false, error: "empty" }); return; }

      var row = {
        survey_id: enc.id,
        round: enc.current_round || null,
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
