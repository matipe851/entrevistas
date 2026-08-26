// Función serverless (Vercel) — LEE el Gmail del reclutador (con su access token) y devuelve
// los mails que matchean una búsqueda, con: asunto, remitente, cuerpo en texto y el PRIMER
// adjunto PDF (si hay). El cliente después rutea cada CV a la carpeta según el asunto.
// Requiere que el usuario haya dado el permiso gmail.readonly (scope restringido de Google).

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (rateLimited("gc:" + clientIp(req), 20, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }
  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var accessToken = String(b.accessToken || "").trim();
    var query = String(b.query || "").slice(0, 500);
    var max = Math.min(parseInt(b.max, 10) || 25, 40);
    if (!accessToken) { res.status(200).json({ ok: false, error: "no_token" }); return; }

    var AUTH = { Authorization: "Bearer " + accessToken };
    var base = "https://gmail.googleapis.com/gmail/v1/users/me";

    var listUrl = base + "/messages?maxResults=" + max + (query ? ("&q=" + encodeURIComponent(query)) : "");
    var lr = await fetch(listUrl, { headers: AUTH });
    if (lr.status === 401) { res.status(200).json({ ok: false, error: "unauthorized" }); return; }
    if (lr.status === 403) { res.status(200).json({ ok: false, error: "insufficient_scope" }); return; }
    var lj = await lr.json();
    var msgs = (lj && lj.messages) || [];
    if (!msgs.length) { res.status(200).json({ ok: true, emails: [] }); return; }

    var emails = [];
    for (var i = 0; i < msgs.length; i++) {
      try {
        var mr = await fetch(base + "/messages/" + msgs[i].id + "?format=full", { headers: AUTH });
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
          var ar = await fetch(base + "/messages/" + msgs[i].id + "/attachments/" + cand.attachmentId, { headers: AUTH });
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
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
