// Función serverless (Vercel) — analiza la entrevista con Google Gemini (nivel gratuito).
// La clave se toma de la variable de entorno GEMINI_API_KEY (se configura en Vercel,
// nunca en el código). Si no está configurada, la app usa el análisis por reglas como respaldo.

const MODEL = "gemini-2.0-flash";

function buildPrompt(body) {
  var c = body || {};
  var puesto = c.position || "el puesto";
  var empresa = c.company || "";
  var focos = c.focus || "";
  var nivel = c.level || "";
  var qs = Array.isArray(c.questions) ? c.questions : [];

  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia seleccionando personal para el puesto de: " + puesto + ".");
  if (empresa) lines.push("Contexto de la empresa: " + empresa + ".");
  if (focos) lines.push("Competencias/foco a evaluar: " + focos + ".");
  if (nivel) lines.push("Seniority buscado: " + nivel + ".");
  lines.push("");
  lines.push("A continuación tenés las preguntas y las respuestas del candidato (transcripción automática por voz; puede tener errores menores de transcripción, evaluá la intención y el contenido, no la ortografía).");
  lines.push("");
  qs.forEach(function (q, i) {
    lines.push("Pregunta " + (i + 1) + " [" + (q.category || "") + "]: " + (q.text || ""));
    var t = (q.transcript || "").trim();
    lines.push("Respuesta: " + (t ? t : "(sin respuesta / no respondió)"));
    if (q.durationSec != null) lines.push("(duración de la respuesta: " + q.durationSec + "s)");
    lines.push("");
  });
  lines.push("Analizá con criterio profesional y exigente, como lo harías en un proceso real. No infles puntajes: una respuesta vacía, de una sola palabra (por ejemplo solo el nombre) o que no responde lo que se pregunta debe puntuar muy bajo. Valorá contenido, ejemplos concretos, relevancia para el puesto, claridad y profundidad.");
  lines.push("");
  lines.push("Devolvé EXCLUSIVAMENTE un JSON válido con esta forma exacta:");
  lines.push('{');
  lines.push('  "score": (número del 1 al 10, medio punto permitido),');
  lines.push('  "recommendation": ("Avanzar" | "Con reservas" | "No avanzar"),');
  lines.push('  "overall": (2-4 oraciones con tu veredicto general del candidato para el puesto),');
  lines.push('  "perQuestion": [ { "n": (número de pregunta), "rating": ("sólida"|"aceptable"|"floja"|"insuficiente"), "assessment": (1-2 oraciones evaluando esa respuesta puntualmente) } ],');
  lines.push('  "strengths": [ (fortalezas concretas, máximo 5) ],');
  lines.push('  "improve": [ (debilidades o puntos a mejorar concretos, máximo 5) ],');
  lines.push('  "probes": [ (2-3 repreguntas sugeridas para una próxima ronda) ]');
  lines.push('}');
  lines.push("Escribí todo en español rioplatense, profesional y directo. No agregues texto fuera del JSON.");
  return lines.join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  var key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(200).json({ ok: false, error: "no_key" });
    return;
  }
  try {
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    var prompt = buildPrompt(body);
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + encodeURIComponent(key);
    var r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json", maxOutputTokens: 2048 }
      })
    });
    var data = await r.json();
    if (!r.ok) {
      res.status(200).json({ ok: false, error: "gemini_error", detail: (data && data.error && data.error.message) || ("HTTP " + r.status) });
      return;
    }
    var text = "";
    try { text = data.candidates[0].content.parts[0].text || ""; } catch (e) { text = ""; }
    var parsed = null;
    try { parsed = JSON.parse(text); } catch (e) {
      // A veces viene con ```json ... ```; intentamos limpiar.
      var cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      try { parsed = JSON.parse(cleaned); } catch (e2) { parsed = null; }
    }
    if (!parsed) {
      res.status(200).json({ ok: false, error: "parse_error", raw: text.slice(0, 500) });
      return;
    }
    res.status(200).json({ ok: true, analysis: parsed });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
