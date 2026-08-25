// Función serverless (Vercel) — envía un mail DESDE la cuenta de Gmail del reclutador,
// usando el access token de Google que obtuvimos al iniciar sesión con Google (scope gmail.send).
// No usa variables de entorno para enviar: el token viaja en el body (es del propio usuario).
// Devuelve { ok:true } o { ok:false, error, status }. Si el token venció -> status 401 / "unauthorized".

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
function b64url(str) { return Buffer.from(String(str), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
// Codifica un header con posibles caracteres no-ASCII (RFC 2047).
function encHeader(s) {
  s = String(s || "");
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return "=?UTF-8?B?" + b64(s) + "?=";
}
// Parte el base64 del cuerpo en líneas de 76 chars (recomendado por MIME).
function wrap76(s) { return String(s).replace(/.{1,76}/g, "$&\r\n").trim(); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (rateLimited("gm:" + clientIp(req), 60, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }
  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};

    var accessToken = String(b.accessToken || "").trim();
    var to = String(b.to || "").trim();
    var subject = String(b.subject || "Entrevista").slice(0, 300);
    var message = String(b.message || "").slice(0, 60000);
    var fromName = String(b.fromName || "").slice(0, 120);
    var fromEmail = String(b.fromEmail || "").trim();

    if (!accessToken) { res.status(200).json({ ok: false, error: "no_token" }); return; }
    if (!isEmail(to)) { res.status(200).json({ ok: false, error: "bad_recipient" }); return; }

    var headers = [];
    headers.push("To: " + to);
    if (fromName && isEmail(fromEmail)) headers.push('From: "' + encHeader(fromName).replace(/"/g, "") + '" <' + fromEmail + ">");
    headers.push("Subject: " + encHeader(subject));
    headers.push("MIME-Version: 1.0");
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push("Content-Transfer-Encoding: base64");
    var raw = headers.join("\r\n") + "\r\n\r\n" + wrap76(b64(message));
    var rawUrl = Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    var r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: rawUrl })
    });
    if (r.ok) { var okj = await r.json().catch(function () { return {}; }); res.status(200).json({ ok: true, id: okj && okj.id }); return; }
    if (r.status === 401) { res.status(200).json({ ok: false, error: "unauthorized", status: 401 }); return; }
    var errText = "";
    try { var ej = await r.json(); errText = (ej && ej.error && (ej.error.message || ej.error.status)) || ""; } catch (e) { errText = "HTTP " + r.status; }
    res.status(200).json({ ok: false, error: "gmail_error", status: r.status, detail: String(errText).slice(0, 300) });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
