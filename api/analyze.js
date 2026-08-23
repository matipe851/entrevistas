// Función serverless (Vercel) — usa Google Gemini (nivel gratuito).
// Dos tareas:
//   - task: "questions"  -> genera preguntas a medida del puesto/empresa/CV
//   - (por defecto)      -> analiza las respuestas de la entrevista
// La clave se toma de la variable de entorno GEMINI_API_KEY (se configura en Vercel,
// nunca en el código). Si no está, la app usa reglas/plantillas como respaldo.

const MODEL = "gemini-2.0-flash";

var CATEGORIES = ["Presentación", "Experiencia", "Competencias", "Situacional", "Motivación y cultura", "Cierre"];

function analysisPrompt(body) {
  var c = body || {};
  var puesto = c.position || "el puesto";
  var qs = Array.isArray(c.questions) ? c.questions : [];
  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia seleccionando personal para el puesto de: " + puesto + ".");
  if (c.company) lines.push("Contexto de la empresa: " + c.company + ".");
  if (c.focus) lines.push("Competencias/foco a evaluar: " + c.focus + ".");
  if (c.level) lines.push("Seniority buscado: " + c.level + ".");
  lines.push("");
  lines.push("A continuación tenés las preguntas y respuestas del candidato (transcripción automática por voz; puede tener errores menores, evaluá la intención y el contenido, no la ortografía).");
  lines.push("");
  qs.forEach(function (q, i) {
    lines.push("Pregunta " + (i + 1) + " [" + (q.category || "") + "]: " + (q.text || ""));
    var t = (q.transcript || "").trim();
    lines.push("Respuesta: " + (t ? t : "(sin respuesta / no respondió)"));
    if (q.durationSec != null) lines.push("(duración: " + q.durationSec + "s)");
    lines.push("");
  });
  lines.push("Analizá con criterio profesional y exigente, como en un proceso real. No infles puntajes: una respuesta vacía, de una sola palabra (por ejemplo solo el nombre) o que no responde lo que se pregunta debe puntuar muy bajo. Valorá contenido, ejemplos concretos, relevancia para el puesto, claridad y profundidad.");
  lines.push("");
  lines.push("Devolvé EXCLUSIVAMENTE un JSON válido con esta forma exacta:");
  lines.push('{');
  lines.push('  "score": (número del 1 al 10, medio punto permitido),');
  lines.push('  "recommendation": ("Avanzar" | "Con reservas" | "No avanzar"),');
  lines.push('  "overall": (2-4 oraciones con tu veredicto general),');
  lines.push('  "perQuestion": [ { "n": (número), "rating": ("sólida"|"aceptable"|"floja"|"insuficiente"), "assessment": (1-2 oraciones) } ],');
  lines.push('  "strengths": [ (máximo 5) ],');
  lines.push('  "improve": [ (máximo 5) ],');
  lines.push('  "probes": [ (2-3 repreguntas sugeridas) ]');
  lines.push('}');
  lines.push("Todo en español rioplatense, profesional y directo. Nada de texto fuera del JSON.");
  return lines.join("\n");
}

function questionsPrompt(body) {
  var c = body || {};
  var puesto = c.position || "el puesto";
  var n = parseInt(c.count, 10) || 7;
  if (n < 5) n = 5; if (n > 12) n = 12;
  var hasCV = !!(c.cv && c.cv.data);
  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia. Tenés que diseñar una entrevista de trabajo para el puesto de: " + puesto + ".");
  if (c.company) lines.push("Empresa y contexto: " + c.company + ".");
  if (c.focus) lines.push("Competencias/foco a evaluar: " + c.focus + ".");
  if (c.level) lines.push("Seniority buscado: " + c.level + ".");
  lines.push("");
  lines.push("Generá exactamente " + n + " preguntas ESENCIALES, claras y directas, SIN repetir ni reformular la misma idea. Deben cubrir: la experiencia real del candidato, su idoneidad para el puesto, y su interés/conocimiento de la empresa. Nada de preguntas genéricas de relleno ni repreguntas.");
  if (hasCV) {
    lines.push("Se adjunta el CV del candidato. Leelo y adaptá 2 o 3 de las preguntas a su experiencia concreta (empresas, roles, logros o herramientas que figuren en el CV), siempre manteniendo la relevancia con el puesto.");
  }
  if (c.language === "es" && c.includeEnglish) {
    lines.push("Incluí 2 de las preguntas en INGLÉS (marcalas con \"lang\":\"en\") para evaluar el nivel del idioma.");
  }
  lines.push("");
  lines.push("Devolvé EXCLUSIVAMENTE un JSON válido con esta forma exacta:");
  lines.push('{ "questions": [ { "text": (la pregunta), "category": (una de: ' + CATEGORIES.join(", ") + '), "lang": ("es" | "en") } ] }');
  lines.push("La primera pregunta debe ser de categoría \"Presentación\" y la última de \"Cierre\". Todo en español rioplatense (salvo las que pidas en inglés). Nada de texto fuera del JSON.");
  return lines.join("\n");
}

async function callGemini(key, parts, maxTokens) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + encodeURIComponent(key);
  var r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: parts }],
      generationConfig: { temperature: 0.5, responseMimeType: "application/json", maxOutputTokens: maxTokens || 2048 }
    })
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
function extractText(data) {
  try { return data.candidates[0].content.parts[0].text || ""; } catch (e) { return ""; }
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
      var parts = [{ text: questionsPrompt(body) }];
      if (body.cv && body.cv.data) {
        parts.push({ inline_data: { mime_type: (body.cv.mimeType || "application/pdf"), data: body.cv.data } });
      }
      var g = await callGemini(key, parts, 2048);
      if (!g.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (g.data && g.data.error && g.data.error.message) || ("HTTP " + g.status) }); return; }
      var parsedQ = parseJson(extractText(g.data));
      var qs = parsedQ && Array.isArray(parsedQ.questions) ? parsedQ.questions : null;
      if (!qs || !qs.length) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, questions: qs });
      return;
    }

    // Análisis por defecto
    var ga = await callGemini(key, [{ text: analysisPrompt(body) }], 2048);
    if (!ga.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (ga.data && ga.data.error && ga.data.error.message) || ("HTTP " + ga.status) }); return; }
    var parsed = parseJson(extractText(ga.data));
    if (!parsed) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
    res.status(200).json({ ok: true, analysis: parsed });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
