// Función serverless (Vercel) — TODO lo que habla con Google, en un solo archivo.
// Vercel cuenta una función por archivo dentro de /api y el plan Hobby admite hasta 12,
// así que las tres operaciones viajan por el mismo endpoint y se eligen con "action":
//
//   action "send"    -> envía un mail DESDE el Gmail del reclutador (scope gmail.send).
//   action "cvs"     -> lee su Gmail y devuelve los mails que matchean una búsqueda,
//                       con el primer adjunto PDF (scope gmail.readonly).
//   action "refresh" -> renueva el access token a partir del refresh token.
//
// Los tokens del usuario viajan en el body (son suyos). Para "refresh" hacen falta las
// credenciales de la app OAuth: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.

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
function b64(str) { return Buffer.from(String(str), "utf8").toString("base64"); }
// Codifica un header con posibles caracteres no-ASCII (RFC 2047).
function encHeader(s) {
  s = String(s || "");
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return "=?UTF-8?B?" + b64(s) + "?=";
}
// Parte el base64 del cuerpo en líneas de 76 chars (recomendado por MIME).
function wrap76(s) { return String(s).replace(/.{1,76}/g, "$&\r\n").trim(); }
function b64urlDecode(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  try { return Buffer.from(s, "base64").toString("utf8"); } catch (e) { return ""; }
}
function header(headers, name) {
  name = name.toLowerCase();
  var h = (headers || []).filter(function (x) { return String(x.name || "").toLowerCase() === name; })[0];
  return h ? h.value : "";
}
// Recorre el árbol de partes: junta texto/plano y los adjuntos PDF (id + filename).
function walkParts(payload, out) {
  if (!payload) return;
  var mt = payload.mimeType || "";
  var fn = payload.filename || "";
  if (fn && payload.body && payload.body.attachmentId && /pdf/i.test(mt + " " + fn)) {
    out.pdfs.push({ filename: fn, attachmentId: payload.body.attachmentId, size: payload.body.size || 0 });
  } else if (mt === "text/plain" && payload.body && payload.body.data) {
    out.text += (out.text ? "\n" : "") + b64urlDecode(payload.body.data);
  } else if (mt === "text/html" && payload.body && payload.body.data && !out.text) {
    out.html += b64urlDecode(payload.body.data);
  }
  (payload.parts || []).forEach(function (p) { walkParts(p, out); });
}
function stripHtml(h) { return String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    // Sin "action" asumimos el envío de un mail, que es el uso más común.
    var action = String(b.action || "send").trim();

    /* ---------- refresh: renovar el access token de Google ---------- */
    if (action === "refresh") {
      var clientId = process.env.GOOGLE_CLIENT_ID;
      var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) { res.status(200).json({ ok: false, error: "no_config" }); return; }
      if (rateLimited("gr:" + clientIp(req), 60, 10 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

      var refreshToken = String(b.refreshToken || "").trim();
      if (!refreshToken) { res.status(200).json({ ok: false, error: "no_refresh_token" }); return; }

      var form = new URLSearchParams();
      form.set("client_id", clientId);
      form.set("client_secret", clientSecret);
      form.set("refresh_token", refreshToken);
      form.set("grant_type", "refresh_token");

      var rr = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      });
      var rj = await rr.json().catch(function () { return {}; });
      if (rr.ok && rj && rj.access_token) { res.status(200).json({ ok: true, access_token: rj.access_token, expires_in: rj.expires_in || 3600 }); return; }
      res.status(200).json({ ok: false, error: "refresh_failed", detail: String((rj && (rj.error_description || rj.error)) || ("HTTP " + rr.status)).slice(0, 300) });
      return;
    }

    var accessToken = String(b.accessToken || "").trim();

    /* ---------- cvs: leer el Gmail del reclutador y traer los CVs ---------- */
    if (action === "cvs") {
      if (rateLimited("gc:" + clientIp(req), 20, 10 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }
      var query = String(b.query || "").slice(0, 500);
      var max = Math.min(parseInt(b.max, 10) || 25, 40);
      if (!accessToken) { res.status(200).json({ ok: false, error: "no_token" }); return; }

      var AUTH = { Authorization: "Bearer " + accessToken };
      var gbase = "https://gmail.googleapis.com/gmail/v1/users/me";

      var listUrl = gbase + "/messages?maxResults=" + max + (query ? ("&q=" + encodeURIComponent(query)) : "");
      var lr = await fetch(listUrl, { headers: AUTH });
      if (lr.status === 401) { res.status(200).json({ ok: false, error: "unauthorized" }); return; }
      if (lr.status === 403) { res.status(200).json({ ok: false, error: "insufficient_scope" }); return; }
      var lj = await lr.json();
      var msgs = (lj && lj.messages) || [];
      if (!msgs.length) { res.status(200).json({ ok: true, emails: [] }); return; }

      var emails = [];
      for (var i = 0; i < msgs.length; i++) {
        try {
          var mr = await fetch(gbase + "/messages/" + msgs[i].id + "?format=full", { headers: AUTH });
          if (!mr.ok) continue;
          var mj = await mr.json();
          var hs = (mj.payload && mj.payload.headers) || [];
          var out = { text: "", html: "", pdfs: [] };
          walkParts(mj.payload, out);
          var bodyText = out.text || stripHtml(out.html);
          var pdf = null;
          // Traemos el primer PDF razonable (<= 8 MB).
          var cand = out.pdfs.filter(function (p) { return (p.size || 0) <= 8 * 1024 * 1024; })[0];
          if (cand) {
            var ar = await fetch(gbase + "/messages/" + msgs[i].id + "/attachments/" + cand.attachmentId, { headers: AUTH });
            if (ar.ok) { var aj = await ar.json(); if (aj && aj.data) pdf = { filename: cand.filename, dataBase64: aj.data }; }
          }
          emails.push({
            id: msgs[i].id,
            subject: header(hs, "Subject"),
            from: header(hs, "From"),
            date: header(hs, "Date"),
            bodyText: String(bodyText || "").slice(0, 20000),
            pdf: pdf
          });
        } catch (e) { /* seguimos con el próximo */ }
      }
      res.status(200).json({ ok: true, emails: emails });
      return;
    }

    /* ---------- send: mandar un mail desde el Gmail del reclutador ---------- */
    if (action === "send") {
      if (rateLimited("gm:" + clientIp(req), 60, 10 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }
      var to = String(b.to || "").trim();
      var subject = String(b.subject || "Entrevista").slice(0, 300);
      var message = String(b.message || "").slice(0, 60000);
      var brandName = String(b.brandName || "").slice(0, 120).trim();
      var brandLogo = String(b.brandLogo || "").slice(0, 1000).trim();
      var fromName = String(b.fromName || brandName || "").slice(0, 120);
      var fromEmail = String(b.fromEmail || "").trim();

      if (!accessToken) { res.status(200).json({ ok: false, error: "no_token" }); return; }
      if (!isEmail(to)) { res.status(200).json({ ok: false, error: "bad_recipient" }); return; }

      // multipart/alternative: el texto plano de siempre + la versión con la marca.
      var boundary = "voz_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      var hdrs = [];
      hdrs.push("To: " + to);
      if (fromName && isEmail(fromEmail)) hdrs.push('From: "' + encHeader(fromName).replace(/"/g, "") + '" <' + fromEmail + ">");
      hdrs.push("Subject: " + encHeader(subject));
      hdrs.push("MIME-Version: 1.0");
      hdrs.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
      var raw = hdrs.join("\r\n") + "\r\n\r\n" +
        "--" + boundary + "\r\n" +
        'Content-Type: text/plain; charset="UTF-8"\r\n' +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        wrap76(b64(message)) + "\r\n" +
        "--" + boundary + "\r\n" +
        'Content-Type: text/html; charset="UTF-8"\r\n' +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        wrap76(b64(brandedHtml(brandName, brandLogo, message))) + "\r\n" +
        "--" + boundary + "--";
      var rawUrl = Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      var sr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: rawUrl })
      });
      if (sr.ok) { var okj = await sr.json().catch(function () { return {}; }); res.status(200).json({ ok: true, id: okj && okj.id }); return; }
      if (sr.status === 401) { res.status(200).json({ ok: false, error: "unauthorized", status: 401 }); return; }
      var errText = "";
      try { var ej = await sr.json(); errText = (ej && ej.error && (ej.error.message || ej.error.status)) || ""; } catch (e) { errText = "HTTP " + sr.status; }
      res.status(200).json({ ok: false, error: "gmail_error", status: sr.status, detail: String(errText).slice(0, 300) });
      return;
    }

    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
