// Función serverless (Vercel) — PÚBLICA. Firma por parte del empleado.
//   Por defecto firma el LEGAJO (tabla employees).
//   Con kind:"doc" firma UN DOCUMENTO del área Documentación (tabla hr_documents).
//   action "get":  devuelve los datos a partir del token de firma.
//   action "sign": guarda la firma (nombre + estilo) y la fecha de firma.
// El empleado NO tiene sesión: se usa la SERVICE ROLE del lado del servidor.
// Variables de entorno en Vercel: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// (Legajo y documento están unidos en este archivo para no superar el límite de 12
//  funciones serverless del plan Hobby de Vercel.)

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
  if (rateLimited("sign:" + clientIp(req), 40, 5 * 60 * 1000)) { res.status(429).json({ ok: false, error: "rate_limited" }); return; }

  try {
    var b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};
    var token = String(b.token || "").trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) { res.status(200).json({ ok: false, error: "bad_token" }); return; }

    var base = url.replace(/\/+$/, "");
    var headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

    // ---- Archivar la CONSTANCIA firmada (PDF) en el legajo del empleado (carpeta "Documentos firmados") ----
    if (b.action === "constancia") {
      var pdfUrl = String(b.url || "").trim();
      if (!/^https:\/\/[^\s]+$/.test(pdfUrl)) { res.status(200).json({ ok: false, error: "bad_url" }); return; }
      var cTitle = String(b.title || "Documento firmado").slice(0, 200);
      var cKind = (b.kind === "doc" || b.kind === "hs") ? b.kind : "legajo";
      var empId = null;
      if (cKind === "legajo") {
        var erL = await fetch(base + "/rest/v1/employees?sign_token=eq." + encodeURIComponent(token) + "&select=id&limit=1", { headers: headers });
        var rL = await erL.json(); if (Array.isArray(rL) && rL[0]) empId = rL[0].id;
      } else {
        var tbl = (cKind === "hs") ? "health_safety" : "hr_documents";
        var erR = await fetch(base + "/rest/v1/" + tbl + "?sign_token=eq." + encodeURIComponent(token) + "&select=employee_id&limit=1", { headers: headers });
        var rR = await erR.json(); if (Array.isArray(rR) && rR[0]) empId = rR[0].employee_id;
      }
      if (!empId) { res.status(200).json({ ok: false, error: "not_found" }); return; }
      var erD2 = await fetch(base + "/rest/v1/employees?id=eq." + encodeURIComponent(empId) + "&select=documents&limit=1", { headers: headers });
      var rD2 = await erD2.json();
      var docsArr = (Array.isArray(rD2) && rD2[0] && Array.isArray(rD2[0].documents)) ? rD2[0].documents : [];
      var rid = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      docsArr.push({ id: rid, label: "Firmado", folder: "firmados", title: cTitle, filename: cTitle + ".pdf", url: pdfUrl, signed_pdf: true, source: cKind, signed_at: new Date().toISOString() });
      var prC = await fetch(base + "/rest/v1/employees?id=eq." + encodeURIComponent(empId), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify({ documents: docsArr })
      });
      if (!prC.ok) { res.status(200).json({ ok: false, error: "save_failed" }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    // ---- Firma de UN DOCUMENTO (hr_documents) o de UNA ENTREGA DE EPP (health_safety) ----
    if (b.kind === "doc" || b.kind === "hs") {
      var isHs = (b.kind === "hs");
      var tableD = isHs ? "health_safety" : "hr_documents";
      var dateCol = isHs ? "date" : "doc_date";
      var selD = "id,type,title,detail," + dateCol + ",file_url,file_name,signed_at,signature_name,signature_font,employees(first_name,last_name)";
      var erD = await fetch(base + "/rest/v1/" + tableD + "?sign_token=eq." + encodeURIComponent(token) + "&select=" + encodeURIComponent(selD) + "&limit=1", { headers: headers });
      var rowsD = await erD.json();
      var doc = Array.isArray(rowsD) && rowsD[0] ? rowsD[0] : null;
      if (!doc) { res.status(200).json({ ok: false, error: "not_found" }); return; }
      var empD = doc.employees || {};
      var empNameD = ((empD.first_name || "") + " " + (empD.last_name || "")).trim();

      if (b.action === "get") {
        res.status(200).json({ ok: true, employee_name: empNameD, doc: {
          label: doc.title || (doc.type ? String(doc.type) : (isHs ? "Entrega" : "Documento")),
          type: isHs ? "Entrega de EPP" : (doc.type || ""),
          filename: doc.file_name || "", url: doc.file_url || "",
          detail: doc.detail || "", doc_date: doc[dateCol] || "",
          signature_name: doc.signature_name || "", signature_font: doc.signature_font || 1,
          signed_at: doc.signed_at || null
        } });
        return;
      }
      if (b.action === "sign") {
        var signNameD = String(b.signature_name || "").slice(0, 120).trim();
        var signFontD = parseInt(b.signature_font, 10); if (isNaN(signFontD) || signFontD < 1 || signFontD > 4) signFontD = 1;
        if (!signNameD) { res.status(200).json({ ok: false, error: "no_name" }); return; }
        var patchD = { signature_name: signNameD, signature_font: signFontD, signed_at: new Date().toISOString() };
        if (!isHs) patchD.signed = true; // hr_documents tiene columna 'signed'; health_safety no.
        var prD = await fetch(base + "/rest/v1/" + tableD + "?id=eq." + encodeURIComponent(doc.id), {
          method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(patchD)
        });
        if (!prD.ok) { res.status(200).json({ ok: false, error: "save_failed" }); return; }
        res.status(200).json({ ok: true, signed_at: patchD.signed_at });
        return;
      }
      res.status(200).json({ ok: false, error: "bad_action" });
      return;
    }

    // ---- Firma del LEGAJO (tabla employees) ----
    // Buscar el empleado por token (con todos los datos del legajo para mostrarle qué firma)
    var er = await fetch(base + "/rest/v1/employees?sign_token=eq." + encodeURIComponent(token) + "&select=id,first_name,last_name,legajo_number,dni,cuil,birth_date,address,email,phone,hire_date,position,category,collective_agreement,contract_type,salary,shift_in,shift_out,work_days,schedule_type,signature_name,signature_font,signed_at&limit=1", { headers: headers });
    var rows = await er.json();
    var emp = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!emp) { res.status(200).json({ ok: false, error: "not_found" }); return; }

    if (b.action === "get") {
      res.status(200).json({ ok: true, employee: {
        first_name: emp.first_name || "", last_name: emp.last_name || "", legajo_number: emp.legajo_number || "",
        dni: emp.dni || "", cuil: emp.cuil || "", birth_date: emp.birth_date || "", address: emp.address || "",
        email: emp.email || "", phone: emp.phone || "", hire_date: emp.hire_date || "",
        position: emp.position || "", category: emp.category || "", collective_agreement: emp.collective_agreement || "",
        contract_type: emp.contract_type || "", salary: emp.salary || "",
        shift_in: emp.shift_in || "", shift_out: emp.shift_out || "", work_days: emp.work_days || "", schedule_type: emp.schedule_type || "",
        signature_name: emp.signature_name || "", signature_font: emp.signature_font || 1,
        signed_at: emp.signed_at || null
      } });
      return;
    }

    if (b.action === "sign") {
      var signName = String(b.signature_name || "").slice(0, 120).trim();
      var signFont = parseInt(b.signature_font, 10); if (isNaN(signFont) || signFont < 1 || signFont > 4) signFont = 1;
      if (!signName) { res.status(200).json({ ok: false, error: "no_name" }); return; }
      var patch = { signature_name: signName, signature_font: signFont, signed_at: new Date().toISOString() };
      var pr = await fetch(base + "/rest/v1/employees?id=eq." + encodeURIComponent(emp.id), {
        method: "PATCH", headers: Object.assign({}, headers, { Prefer: "return=minimal" }), body: JSON.stringify(patch)
      });
      if (!pr.ok) { res.status(200).json({ ok: false, error: "save_failed" }); return; }
      res.status(200).json({ ok: true, signed_at: patch.signed_at });
      return;
    }

    res.status(200).json({ ok: false, error: "bad_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
