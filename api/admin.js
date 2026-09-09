// Función serverless (Vercel) — administración: cuentas de reclutadores y el
// panel de métricas del dueño.
// Solo la puede usar el/los dueño(s), definidos en la variable de entorno ADMIN_EMAILS
// (uno o varios emails separados por coma). Verifica el token del que llama contra Supabase.
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS.

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

async function callerEmail(base, anonOrService, token) {
  try {
    var r = await fetch(base + "/auth/v1/user", { headers: { apikey: anonOrService, Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    var u = await r.json();
    return (u && u.email) ? String(u.email).toLowerCase() : null;
  } catch (e) { return null; }
}

/* ============================================================
   MÉTRICAS DEL DUEÑO
   Van acá, con la service role, por dos motivos: las tablas del mentor
   son privadas de cada candidato (RLS por usuario), así que desde el
   navegador ni el admin las puede leer; y así se ve TODO junto sin
   aflojarle la seguridad a nadie.
   De los simulacros del mentor sólo se sacan números agregados: nunca
   las respuestas ni las transcripciones de la gente.
   ============================================================ */
var MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function mesKey(d) { return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2); }
function mesLabel(k) {
  var p = String(k).split("-");
  return (MESES[parseInt(p[1], 10) - 1] || "") + " " + String(p[0]).slice(2);
}
/* Trae una tabla; si no existe (falta correr su SQL) devuelve null en vez de romper. */
async function tabla(base, headers, nombre, select, orden, limite) {
  try {
    var r = await fetch(base + "/rest/v1/" + nombre + "?select=" + encodeURIComponent(select) +
      "&order=" + (orden || "created_at") + ".desc&limit=" + (limite || 5000), { headers: headers });
    if (!r.ok) return null;
    var j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch (e) { return null; }
}
function desde(dias) { return Date.now() - dias * 24 * 60 * 60 * 1000; }
function contarDesde(filas, dias) {
  var t = desde(dias);
  return (filas || []).filter(function (x) { var d = Date.parse(x.created_at); return isFinite(d) && d >= t; }).length;
}
/* Top N de un campo de texto, para "los puestos más buscados". */
function top(filas, campo, n) {
  var c = {};
  (filas || []).forEach(function (x) {
    var k = String(x[campo] || "").trim().toLowerCase();
    if (!k) return;
    k = k.charAt(0).toUpperCase() + k.slice(1);
    c[k] = (c[k] || 0) + 1;
  });
  return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, n || 8)
    .map(function (k) { return { k: k, n: c[k] }; });
}
/* Serie de los últimos 12 meses con varias cosas contadas a la vez. */
function serieMensual(fuentes) {
  var meses = [], hoy = new Date();
  for (var i = 11; i >= 0; i--) {
    var d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    meses.push({ k: mesKey(d), label: mesLabel(mesKey(d)) });
  }
  var idx = {};
  meses.forEach(function (m) { idx[m.k] = { mes: m.k, label: m.label }; Object.keys(fuentes).forEach(function (f) { idx[m.k][f] = 0; }); });
  Object.keys(fuentes).forEach(function (f) {
    (fuentes[f] || []).forEach(function (x) {
      var d = new Date(Date.parse(x.created_at));
      if (isNaN(d.getTime())) return;
      var k = mesKey(d);
      if (idx[k]) idx[k][f]++;
    });
  });
  return meses.map(function (m) { return idx[m.k]; });
}
function prom(nums) {
  var v = (nums || []).filter(function (x) { return typeof x === "number" && isFinite(x); });
  return v.length ? +(v.reduce(function (a, b) { return a + b; }, 0) / v.length).toFixed(2) : null;
}

async function construirMetricas(base, headers) {
  var [
    perfiles, entrevistas, cvs, avisos, busquedas, empleados,
    encuestas, respuestas, planes, valores, reconocimientos, anuncios,
    mentorPerfiles, mentorSesiones
  ] = await Promise.all([
    tabla(base, headers, "profiles", "id,email,approved,created_at"),
    tabla(base, headers, "interviews", "id,position,score,recommendation,candidate_email,created_at"),
    tabla(base, headers, "cvs", "id,created_at"),
    tabla(base, headers, "job_posts", "id,position,active,created_at"),
    tabla(base, headers, "searches", "id,created_at"),
    tabla(base, headers, "employees", "id,status,created_at"),
    tabla(base, headers, "climate_surveys", "id,title,status,questions,created_at"),
    tabla(base, headers, "climate_responses", "id,survey_id,answers,submitted_at", "submitted_at"),
    tabla(base, headers, "action_plans", "id,status,created_at"),
    tabla(base, headers, "culture_values", "id,created_at"),
    tabla(base, headers, "recognitions", "id,created_at"),
    tabla(base, headers, "announcements", "id,status,created_at"),
    tabla(base, headers, "mentor_profiles", "id,created_at"),
    tabla(base, headers, "mentor_sessions", "id,user_id,position,level,score,status,created_at")
  ]);

  // --- Reclutamiento ---
  var ent = entrevistas || [];
  var conNota = ent.filter(function (x) { return typeof x.score === "number"; });
  var dist = { aprobado: 0, medio: 0, desaprobado: 0 };
  conNota.forEach(function (x) {
    if (x.score >= 7) dist.aprobado++; else if (x.score >= 5) dist.medio++; else dist.desaprobado++;
  });

  // --- Mentor ---
  var ms = mentorSesiones || [];
  var listos = ms.filter(function (x) { return x.status === "listo"; });
  var porUsuario = {};
  ms.forEach(function (x) { if (x.user_id) porUsuario[x.user_id] = (porUsuario[x.user_id] || 0) + 1; });
  var repitieron = Object.keys(porUsuario).filter(function (k) { return porUsuario[k] > 1; }).length;
  var nivel = { junior: 0, semi: 0, senior: 0 };
  ms.forEach(function (x) { if (nivel[x.level] != null) nivel[x.level]++; });

  // --- Clima: eNPS real, mirando qué pregunta es la de eNPS en cada encuesta ---
  var enpsQids = {};
  (encuestas || []).forEach(function (s) {
    var ids = [];
    (Array.isArray(s.questions) ? s.questions : []).forEach(function (q) { if (q && q.type === "enps" && q.id) ids.push(q.id); });
    if (ids.length) enpsQids[s.id] = ids;
  });
  var prom_ = 0, pas = 0, det = 0;
  (respuestas || []).forEach(function (r) {
    var ids = enpsQids[r.survey_id]; if (!ids) return;
    var a = (r.answers && typeof r.answers === "object") ? r.answers : {};
    ids.forEach(function (qid) {
      var n = Number(a[qid]);
      if (!isFinite(n)) return;
      if (n >= 9) prom_++; else if (n >= 7) pas++; else det++;
    });
  });
  var totalEnps = prom_ + pas + det;

  return {
    generado: new Date().toISOString(),
    cuentas: {
      total: (perfiles || []).length,
      aprobadas: (perfiles || []).filter(function (p) { return p.approved; }).length,
      pendientes: (perfiles || []).filter(function (p) { return !p.approved; }).length
    },
    reclutamiento: {
      entrevistas: ent.length,
      d30: contarDesde(ent, 30),
      d7: contarDesde(ent, 7),
      promedio: prom(conNota.map(function (x) { return x.score; })),
      distribucion: dist,
      top_puestos: top(ent, "position", 8),
      cvs: (cvs || []).length,
      cvs_d30: contarDesde(cvs, 30),
      avisos: (avisos || []).length,
      avisos_activos: (avisos || []).filter(function (x) { return x.active; }).length,
      busquedas: (busquedas || []).length
    },
    mentor: {
      usuarios: (mentorPerfiles || []).length,
      usuarios_d30: contarDesde(mentorPerfiles, 30),
      simulacros: ms.length,
      simulacros_d30: contarDesde(ms, 30),
      terminados: listos.length,
      abandonados: ms.length - listos.length,
      terminacion: ms.length ? Math.round(listos.length * 100 / ms.length) : null,
      repitieron: repitieron,
      repeticion: Object.keys(porUsuario).length ? Math.round(repitieron * 100 / Object.keys(porUsuario).length) : null,
      promedio: prom(listos.map(function (x) { return Number(x.score); })),
      top_puestos: top(ms, "position", 8),
      por_nivel: nivel
    },
    personal: {
      empleados: (empleados || []).length,
      activos: (empleados || []).filter(function (e) { return (e.status || "activo") === "activo"; }).length
    },
    clima: {
      encuestas: (encuestas || []).length,
      activas: (encuestas || []).filter(function (s) { return s.status === "activa"; }).length,
      respuestas: (respuestas || []).length,
      enps: totalEnps ? Math.round((prom_ - det) * 100 / totalEnps) : null,
      promotores: prom_, pasivos: pas, detractores: det,
      planes: (planes || []).length,
      planes_abiertos: (planes || []).filter(function (p) { return p.status !== "hecho" && p.status !== "cancelado"; }).length,
      valores: (valores || []).length,
      reconocimientos: (reconocimientos || []).length,
      anuncios: (anuncios || []).length
    },
    serie: serieMensual({
      entrevistas: ent,
      simulacros: ms,
      cuentas: perfiles || []
    }),
    // Qué está configurado y qué falta. Evita tener que andar revisando a mano.
    sistema: {
      tablas: [
        { t: "profiles", ok: perfiles !== null, sql: "base" },
        { t: "interviews", ok: entrevistas !== null, sql: "base" },
        { t: "cvs", ok: cvs !== null, sql: "base" },
        { t: "job_posts", ok: avisos !== null, sql: "base" },
        { t: "employees", ok: empleados !== null, sql: "base (Módulo 2)" },
        { t: "climate_surveys", ok: encuestas !== null, sql: "sql_encuestas.sql" },
        { t: "climate_responses", ok: respuestas !== null, sql: "sql_encuestas.sql" },
        { t: "culture_values", ok: valores !== null, sql: "sql_clima.sql" },
        { t: "recognitions", ok: reconocimientos !== null, sql: "sql_clima.sql" },
        { t: "action_plans", ok: planes !== null, sql: "sql_clima.sql" },
        { t: "announcements", ok: anuncios !== null, sql: "sql_clima.sql" },
        { t: "mentor_profiles", ok: mentorPerfiles !== null, sql: "sql_mentor.sql" },
        { t: "mentor_sessions", ok: mentorSesiones !== null, sql: "sql_mentor.sql" }
      ],
      config: {
        gemini: !!process.env.GEMINI_API_KEY,
        brevo: !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER),
        cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
        admin_emails: !!process.env.ADMIN_EMAILS,
        cron_secret: !!process.env.CRON_SECRET
      }
    }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!url || !key) { res.status(200).json({ ok: false, error: "no_config" }); return; }

  // Rate limit: máx. 40 llamadas cada 5 minutos por IP.
  if (rateLimited("adm:" + clientIp(req), 40, 5 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    if (!b.token) { res.status(200).json({ ok: false, error: "no_token" }); return; }

    var base = url.replace(/\/+$/, "");
    var email = await callerEmail(base, key, b.token);
    if (!email || admins.indexOf(email) < 0) { res.status(200).json({ ok: false, error: "not_admin" }); return; }

    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    if (b.action === "list") {
      var r = await fetch(base + "/rest/v1/profiles?select=id,email,approved,created_at&order=created_at.desc", { headers: headers });
      var rows = await r.json();
      res.status(200).json({ ok: true, profiles: Array.isArray(rows) ? rows : [] });
      return;
    }
    if (b.action === "approve" || b.action === "revoke") {
      if (!b.targetId) { res.status(200).json({ ok: false, error: "no_target" }); return; }
      // approve: aprobado. revoke: vuelve a pendiente.
      var up = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(b.targetId), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }),
        body: JSON.stringify({ approved: b.action === "approve" })
      });
      if (!up.ok) { var t = await up.text(); res.status(200).json({ ok: false, error: "update_failed", detail: t.slice(0, 200) }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    if (b.action === "reject") {
      if (!b.targetId) { res.status(200).json({ ok: false, error: "no_target" }); return; }
      // Desaprobar = eliminar el perfil para que DESAPAREZCA de la lista por completo.
      var delP = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(b.targetId), {
        method: "DELETE", headers: Object.assign({}, headers, { Prefer: "return=minimal" })
      });
      if (!delP.ok) { var t2 = await delP.text(); res.status(200).json({ ok: false, error: "delete_failed", detail: t2.slice(0, 200) }); return; }
      // Best-effort: borrar también la cuenta de autenticación, así la persona puede
      // volver a registrarse desde cero (con Google) si más adelante se la quiere aceptar.
      try {
        await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(b.targetId), {
          method: "DELETE", headers: { apikey: key, Authorization: "Bearer " + key }
        });
      } catch (e) {}
      res.status(200).json({ ok: true });
      return;
    }
    if (b.action === "metrics") {
      var m = await construirMetricas(base, headers);
      res.status(200).json({ ok: true, metrics: m });
      return;
    }
    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
