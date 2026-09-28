// Función serverless (Vercel) — PÚBLICA. Pedido de demo desde la página de presentación.
// 1) Guarda el pedido en Supabase (tabla demo_requests) con la SERVICE ROLE.
// 2) Avisa por mail al dueño (Brevo) con los datos y "responder a" = quien pidió la demo.
// Variables de entorno en Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, BREVO_SENDER.
// Opcional: DEMO_NOTIFY_TO (a quién llega el aviso; por defecto el dueño).

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
function isEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(s || "").trim()); }
function clean(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n); }
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

var PLANS = { inicial: "Inicial", profesional: "Profesional", empresa: "Empresa", "": "Todavía no sé" };
var SIZES = { "1-10": "1 a 10", "11-50": "11 a 50", "51-150": "51 a 150", "151-500": "151 a 500", "500+": "Más de 500", "": "Sin indicar" };

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  // Anti-abuso: máx. 5 pedidos cada 30 minutos por IP.
  var ip = clientIp(req);
  if (rateLimited("demo:" + ip, 5, 30 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};

    // Honeypot: un campo oculto que sólo completan los bots. Respondemos "ok" sin hacer nada.
    if (clean(b.website, 200)) { res.status(200).json({ ok: true }); return; }

    var row = {
      name: clean(b.name, 120),
      company: clean(b.company, 160),
      email: clean(b.email, 200).toLowerCase(),
      phone: clean(b.phone, 60),
      employees: clean(b.employees, 20),
      plan: clean(b.plan, 20).toLowerCase(),
      message: clean(b.message, 2000),
      ip: clean(ip, 80),
      user_agent: clean(req.headers["user-agent"], 300)
    };
    if (!row.name || row.name.length < 2) { res.status(200).json({ ok: false, error: "bad_name" }); return; }
    if (!isEmail(row.email)) { res.status(200).json({ ok: false, error: "bad_email" }); return; }
    if (!row.company) { res.status(200).json({ ok: false, error: "bad_company" }); return; }
    if (!(row.plan in PLANS)) row.plan = "";
    if (!(row.employees in SIZES)) row.employees = "";

    // 1) Guardar
    var stored = false, storeErr = "";
    var url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      try {
        var base = url.replace(/\/+$/, "");
        var r = await fetch(base + "/rest/v1/demo_requests", {
          method: "POST",
          headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(row)
        });
        stored = r.ok;
        if (!r.ok) { try { storeErr = (await r.text()).slice(0, 200); } catch (e) { storeErr = "HTTP " + r.status; } }
      } catch (e) { storeErr = String(e && e.message || e).slice(0, 200); }
    } else storeErr = "no_supabase_config";

    // 2) Avisar por mail
    var mailed = false;
    var apiKey = process.env.BREVO_API_KEY, sender = process.env.BREVO_SENDER;
    var to = process.env.DEMO_NOTIFY_TO || "matipealv@gmail.com";
    if (apiKey && sender && isEmail(to)) {
      var lines = [
        ["Nombre", row.name], ["Empresa", row.company], ["Email", row.email], ["Teléfono", row.phone || "—"],
        ["Empleados", SIZES[row.employees]], ["Plan de interés", PLANS[row.plan]], ["Mensaje", row.message || "—"]
      ];
      var text = "Nuevo pedido de demo desde la página de TalentIA\n\n" +
        lines.map(function (l) { return l[0] + ": " + l[1]; }).join("\n") +
        "\n\nRespondé este mail para escribirle directamente." + (stored ? "" : "\n\n(Ojo: no se pudo guardar en la base: " + storeErr + ")");
      var html = '<div style="margin:0;padding:24px 12px;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;width:100%;background:#fff;border-radius:16px;border-collapse:separate;overflow:hidden">' +
        '<tr><td style="padding:20px 26px;border-bottom:1px solid #EEF1F5;font-size:16px;font-weight:700;color:#16202E">Talent<span style="color:#1AA5A0">IA</span> · Nuevo pedido de demo</td></tr>' +
        '<tr><td style="padding:18px 26px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:14px;color:#16202E">' +
        lines.map(function (l) {
          return '<tr><td style="padding:7px 12px 7px 0;color:#5B6778;white-space:nowrap;vertical-align:top">' + escHtml(l[0]) + '</td><td style="padding:7px 0;line-height:1.5">' + escHtml(l[1]).replace(/\n/g, "<br>") + "</td></tr>";
        }).join("") +
        "</table></td></tr>" +
        '<tr><td style="padding:14px 26px;border-top:1px solid #EEF1F5;font-size:12px;color:#5B6778">Respondé este mail para escribirle directamente. También lo ves en TalentIA → Panel del dueño → Pedidos de demo.</td></tr>' +
        "</table></div>";
      try {
        var m = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: { email: sender, name: "TalentIA" },
            to: [{ email: to }],
            replyTo: { email: row.email, name: row.name },
            subject: ("Pedido de demo: " + row.company + " (" + row.name + ")").slice(0, 200),
            textContent: text,
            htmlContent: html
          })
        });
        mailed = m.status === 201 || m.ok;
      } catch (e) {}
    }

    if (!stored && !mailed) { res.status(200).json({ ok: false, error: "not_delivered" }); return; }
    res.status(200).json({ ok: true, stored: stored, mailed: mailed });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception" });
  }
};
