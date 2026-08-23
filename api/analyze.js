// Función serverless (Vercel) — usa Google Gemini (nivel gratuito).
// Tareas:
//   - task: "questions" -> genera preguntas a medida (puesto, empresa, CV, web, dificultad por nivel)
//   - (por defecto)      -> analiza las respuestas de la entrevista
// Clave en la variable de entorno GEMINI_API_KEY (se configura en Vercel).

const MODEL = "gemini-2.0-flash";
var CATEGORIES = ["Presentación", "Experiencia", "Competencias", "Situacional", "Motivación y cultura", "Cierre"];

var DIFFICULTY = {
  "Junior": "Nivel JUNIOR: preguntas de base y motivación. Evaluá ganas de aprender, conocimientos fundamentales, actitud y situaciones simples del día a día. No exijas experiencia previa profunda.",
  "Semi-Senior": "Nivel SEMI-SENIOR: preguntas de experiencia práctica concreta. Pedí ejemplos reales de problemas resueltos, autonomía, manejo de herramientas y resultados.",
  "Senior": "Nivel SENIOR: preguntas exigentes. Planteá casos complejos, decisiones técnicas o estratégicas, trade-offs, manejo de ambigüedad, mentoreo a otros y buenas prácticas del rubro.",
  "Gerencial": "Nivel GERENCIAL: preguntas de liderazgo y estrategia. Evaluá conducción de equipos, gestión de conflictos, toma de decisiones de alto impacto, indicadores/resultados, presupuesto y visión de negocio."
};

function analysisPrompt(body) {
  var c = body || {};
  var qs = Array.isArray(c.questions) ? c.questions : [];
  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia seleccionando personal para el puesto de: " + (c.position || "el puesto") + ".");
  if (c.company) lines.push("Contexto de la empresa: " + c.company + ".");
  if (c.focus) lines.push("Competencias/foco a evaluar: " + c.focus + ".");
  if (c.level) lines.push("Seniority buscado: " + c.level + ".");
  lines.push("");
  lines.push("Preguntas y respuestas del candidato (transcripción automática por voz; puede tener errores menores, evaluá contenido e intención):");
  lines.push("");
  qs.forEach(function (q, i) {
    lines.push("Pregunta " + (i + 1) + " [" + (q.category || "") + "]: " + (q.text || ""));
    var t = (q.transcript || "").trim();
    lines.push("Respuesta: " + (t ? t : "(sin respuesta / no respondió)"));
    if (q.durationSec != null) lines.push("(duración: " + q.durationSec + "s)");
    lines.push("");
  });
  lines.push("Analizá con criterio profesional y exigente, acorde al seniority. No infles puntajes: una respuesta vacía, de una palabra o que no responde debe puntuar muy bajo.");
  lines.push("Devolvé EXCLUSIVAMENTE un JSON con esta forma:");
  lines.push('{ "score": (1 a 10, medio punto ok), "recommendation": ("Avanzar"|"Con reservas"|"No avanzar"), "overall": (2-4 oraciones), "perQuestion": [ { "n": (número), "rating": ("sólida"|"aceptable"|"floja"|"insuficiente"), "assessment": (1-2 oraciones) } ], "strengths": [..max 5..], "improve": [..max 5..], "probes": [..2-3..] }');
  lines.push("Español rioplatense, profesional. Nada de texto fuera del JSON.");
  return lines.join("\n");
}

function questionsPrompt(body, companyWeb) {
  var c = body || {};
  var n = parseInt(c.count, 10) || 7;
  if (n < 5) n = 5; if (n > 12) n = 12;
  var level = c.level || "Semi-Senior";
  var cvText = (c.cvText || "").toString().slice(0, 12000);
  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia. Diseñá una entrevista de trabajo para el puesto de: " + (c.position || "el puesto") + ".");
  if (c.company) lines.push("Empresa y contexto: " + c.company + ".");
  if (c.focus) lines.push("Competencias/foco a evaluar: " + c.focus + ".");
  lines.push("");
  lines.push("DIFICULTAD SEGÚN EL NIVEL. " + (DIFFICULTY[level] || DIFFICULTY["Semi-Senior"]));
  lines.push("Adaptá claramente la profundidad y exigencia de las preguntas a ese nivel: un puesto gerencial debe tener preguntas mucho más complejas y estratégicas que uno junior.");
  lines.push("");
  lines.push("Generá exactamente " + n + " preguntas ESENCIALES y ORIGINALES. Requisitos:");
  lines.push("- Variá el enfoque y la redacción; NO repitas estructura ni hagas preguntas genéricas de relleno. Que se note que son a medida de ESTE puesto y nivel.");
  lines.push("- Cubrí: experiencia real y logros, competencias del rol, un caso situacional acorde al nivel, y motivación/encaje con la empresa.");
  if (companyWeb) {
    lines.push("");
    lines.push("INFORMACIÓN DE LA EMPRESA (extraída de su web). Usala para 1-2 preguntas sobre el encaje y el conocimiento de la empresa por parte del candidato:");
    lines.push('"""' + companyWeb.slice(0, 3500) + '"""');
  }
  if (cvText && cvText.length > 40) {
    lines.push("");
    lines.push("CV DEL CANDIDATO (texto). Es OBLIGATORIO que uses este CV para hacer 2 o 3 preguntas ESPECÍFICAS y personalizadas sobre su experiencia real: mencioná empresas, proyectos, tecnologías, roles o logros CONCRETOS que aparezcan en el CV. No hagas preguntas genéricas si tenés el dato en el CV:");
    lines.push('"""' + cvText + '"""');
  }
  if (c.language === "es" && c.includeEnglish) {
    lines.push("");
    lines.push('Incluí 2 preguntas en INGLÉS (marcalas con "lang":"en") para evaluar el idioma.');
  }
  lines.push("");
  lines.push("Devolvé EXCLUSIVAMENTE un JSON con esta forma:");
  lines.push('{ "questions": [ { "text": (la pregunta), "category": (una de: ' + CATEGORIES.join(", ") + '), "lang": ("es"|"en") } ] }');
  lines.push('La primera pregunta es de categoría "Presentación" y la última de "Cierre". Español rioplatense (salvo las que pidas en inglés). Nada de texto fuera del JSON.');
  return lines.join("\n");
}

async function callGemini(key, parts, maxTokens, temp) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + encodeURIComponent(key);
  var r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: (temp == null ? 0.5 : temp), responseMimeType: "application/json", maxOutputTokens: maxTokens || 2048 } })
  });
  var data = await r.json();
  return { ok: r.ok, status: r.status, data: data };
}
function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  var cleaned = String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (e2) { return null; }
}
function extractText(data) { try { return data.candidates[0].content.parts[0].text || ""; } catch (e) { return ""; } }

async function fetchCompanyWeb(u) {
  try {
    if (!u) return "";
    u = String(u).trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 7000);
    var r = await fetch(u, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(to);
    if (!r.ok) return "";
    var html = await r.text();
    var text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ").trim();
    return text.slice(0, 4000);
  } catch (e) { return ""; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  var key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: "no_key" }); return; }
  try {
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    if (body.task === "questions") {
      var companyWeb = body.companyUrl ? await fetchCompanyWeb(body.companyUrl) : "";
      var parts = [{ text: questionsPrompt(body, companyWeb) }];
      // Respaldo: si mandaron el CV como archivo (base64) y es chico, lo adjuntamos también.
      if ((!body.cvText || body.cvText.length < 40) && body.cv && body.cv.data && body.cv.data.length < 3500000) {
        parts.push({ inline_data: { mime_type: (body.cv.mimeType || "application/pdf"), data: body.cv.data } });
      }
      var g = await callGemini(key, parts, 2048, 0.85);
      if (!g.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (g.data && g.data.error && g.data.error.message) || ("HTTP " + g.status) }); return; }
      var parsedQ = parseJson(extractText(g.data));
      var qsr = parsedQ && Array.isArray(parsedQ.questions) ? parsedQ.questions : null;
      if (!qsr || !qsr.length) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, questions: qsr, usedCV: !!(body.cvText && body.cvText.length >= 40), usedWeb: !!companyWeb });
      return;
    }

    var ga = await callGemini(key, [{ text: analysisPrompt(body) }], 2048, 0.4);
    if (!ga.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (ga.data && ga.data.error && ga.data.error.message) || ("HTTP " + ga.status) }); return; }
    var parsed = parseJson(extractText(ga.data));
    if (!parsed) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
    res.status(200).json({ ok: true, analysis: parsed });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
