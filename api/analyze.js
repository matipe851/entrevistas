// Función serverless (Vercel) — usa Google Gemini (nivel gratuito).
// Tareas:
//   - task: "questions" -> genera preguntas a medida (puesto, empresa, CV, web, dificultad por nivel)
//   - (por defecto)      -> analiza las respuestas de la entrevista
// Clave en la variable de entorno GEMINI_API_KEY (se configura en Vercel).

const MODEL = "gemini-3.6-flash";
var CATEGORIES = ["Presentación", "Experiencia", "Competencias", "Situacional", "Motivación y cultura", "Cierre"];

// --- Anti-abuso simple en memoria (por instancia del servidor) ---
// Frena loops que quemarían la cuota de Gemini. Sin dependencias ni costo.
var _rlStore = global.__voz_rl || (global.__voz_rl = {});
function rateLimited(key, max, windowMs) {
  var now = Date.now();
  var arr = (_rlStore[key] || []).filter(function (t) { return now - t < windowMs; });
  arr.push(now);
  _rlStore[key] = arr;
  if (Math.random() < 0.02) {
    for (var k in _rlStore) { var a = _rlStore[k]; if (!a.length || now - a[a.length - 1] > windowMs) delete _rlStore[k]; }
  }
  return arr.length > max;
}
function clientIp(req) {
  var xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.headers["x-real-ip"] || "unknown";
}

var DIFFICULTY = {
  "Junior": "Nivel JUNIOR: preguntas de base y motivación. Evaluá ganas de aprender, conocimientos fundamentales, actitud y situaciones simples del día a día. No exijas experiencia previa profunda.",
  "Semi-Senior": "Nivel SEMI-SENIOR: preguntas de experiencia práctica concreta. Pedí ejemplos reales de problemas resueltos, autonomía, manejo de herramientas y resultados.",
  "Senior": "Nivel SENIOR: preguntas exigentes. Planteá casos complejos, decisiones técnicas o estratégicas, trade-offs, manejo de ambigüedad, mentoreo a otros y buenas prácticas del rubro.",
  "Gerencial": "Nivel GERENCIAL: preguntas de liderazgo y estrategia. Evaluá conducción de equipos, gestión de conflictos, toma de decisiones de alto impacto, indicadores/resultados, presupuesto y visión de negocio."
};

function followupPrompt(body) {
  var LN = { es: "español rioplatense", en: "inglés", pt: "portugués", fr: "francés", it: "italiano", de: "alemán" };
  var lang = body.language || "es";
  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia. Estás entrevistando para el puesto de " + (body.position || "el puesto") + " (nivel " + (body.level || "Semi-Senior") + ").");
  lines.push("Le hiciste esta pregunta al candidato:");
  lines.push('"""' + (body.question || "") + '"""');
  lines.push("El candidato respondió (transcripción automática por voz, puede tener errores menores):");
  lines.push('"""' + (body.answer || "(respuesta breve o vacía)") + '"""');
  lines.push("");
  lines.push("Generá UNA sola REPREGUNTA para profundizar. REGLAS OBLIGATORIAS:");
  lines.push("1) ANCLÁ la repregunta a algo CONCRETO que el candidato nombró: una herramienta, tecnología, empresa, proyecto, tarea, número/resultado, decisión, problema o cliente. NOMBRÁ ese elemento textualmente dentro de la repregunta para que quede clarísimo de qué está hablando.");
  lines.push("2) Pedí un DETALLE PUNTUAL y respondible: el paso a paso de cómo lo hizo, un número o resultado medible, un ejemplo específico de esa situación, qué decidió y por qué, o cómo resolvería un caso concreto del puesto.");
  lines.push("3) Tiene que ENTENDERSE SOLA: el candidato debe saber exactamente sobre qué hablar sin adivinar tu intención.");
  lines.push("4) PROHIBIDO usar frases vagas o abiertas del tipo: \"¿podés profundizar?\", \"¿algo más?\", \"contame más\", \"¿podés dar más detalles?\". Siempre apuntá a un tema específico.");
  lines.push("5) Si la respuesta fue genérica, corta o vacía, elegí vos una tarea REAL y concreta del puesto de " + (body.position || "el puesto") + " y preguntá cómo la haría con un ejemplo puntual.");
  lines.push("Ejemplo BIEN: \"Mencionaste que usabas Excel para el control de stock. ¿Qué fórmula o proceso usabas para detectar faltantes?\" — Ejemplo MAL: \"¿Podés profundizar sobre tu experiencia?\".");
  lines.push("Que suene como un entrevistador real. No repitas la pregunta original ni saludes. Máximo 30 palabras.");
  lines.push("Escribila en " + (LN[lang] || "español") + ".");
  lines.push('Devolvé EXCLUSIVAMENTE un JSON con esta forma: { "followup": "la repregunta" }');
  return lines.join("\n");
}
function screeningPrompt(position, description, cvs, must, nice) {
  var lines = [];
  lines.push("Sos un reclutador senior con 20 años de experiencia haciendo screening y preselección de CVs.");
  lines.push("Puesto a cubrir: " + (position || "(sin título)") + ".");
  if (description) {
    lines.push("Descripción del puesto y de lo que se busca (usala como criterio principal):");
    lines.push('"""' + description + '"""');
  }
  if (must) {
    lines.push("");
    lines.push("REQUISITOS EXCLUYENTES (obligatorios). Si en el CV NO hay evidencia clara de que el candidato los cumple, su encaje es \"Bajo\" y el puntaje debe ser MUY bajo (0-30), sin importar lo bueno que sea el resto del CV. En \"cons\" indicá cuál requisito excluyente no cumple:");
    lines.push('"""' + must + '"""');
  }
  if (nice) {
    lines.push("");
    lines.push("REQUISITOS QUE SUMAN PUNTOS (deseables, NO excluyentes). Si el candidato los cumple, subile el puntaje y mencionalos en \"pros\". Si no los cumple, NO lo descartes por eso:");
    lines.push('"""' + nice + '"""');
  }
  lines.push("");
  lines.push("Te paso " + cvs.length + " CV(s) de candidatos. Evaluá cada uno SOLO por su encaje real con este puesto y esta descripción.");
  lines.push("Sé exigente y honesto: si un CV no tiene relación con lo buscado, ponele puntaje bajo. No infles puntajes. Valorá experiencia concreta, tecnologías/herramientas, logros medibles, seniority y coincidencia con los requisitos.");
  lines.push("");
  cvs.forEach(function (c) {
    lines.push("### CANDIDATO id=" + c.id + (c.name ? (" (archivo: " + c.name + ")") : "") + ":");
    lines.push('"""' + (c.text || "(CV vacío o ilegible)") + '"""');
    lines.push("");
  });
  lines.push("Devolvé EXCLUSIVAMENTE un JSON con esta forma, ORDENADO del MÁS adecuado (primero) al MENOS adecuado (último). Incluí TODOS los candidatos:");
  lines.push('{ "ranking": [ { "id": (el id exacto del candidato), "name": (nombre y apellido detectado en el CV, o "" si no se ve), "score": (0 a 100), "fit": ("Alto"|"Medio"|"Bajo"), "summary": (1-2 oraciones de por qué encaja o no con el puesto), "pros": [..hasta 4 puntos fuertes para este puesto..], "cons": [..hasta 4 faltantes o dudas..] } ] }');
  lines.push("Español rioplatense, profesional. Nada de texto fuera del JSON.");
  return lines.join("\n");
}

function analysisPrompt(body) {
  var c = body || {};
  var qs = Array.isArray(c.questions) ? c.questions : [];
  var lines = [];
  lines.push("Sos un entrevistador senior con 20 años de experiencia seleccionando personal para el puesto de: " + (c.position || "el puesto") + ".");
  if (c.company) lines.push("Contexto de la empresa: " + c.company + ".");
  if (c.focus) lines.push("Competencias/foco a evaluar: " + c.focus + ".");
  if (c.level) lines.push("Seniority buscado: " + c.level + ".");
  lines.push("");
  var LANGNAME = { en: "inglés", pt: "portugués", fr: "francés", it: "italiano", de: "alemán" };
  var otherLangs = {};
  // Agrupamos las repreguntas (follow-ups) bajo su pregunta principal (parentN).
  var mains = qs.filter(function (q) { return !q.isFollowup; });
  var followsByParent = {};
  qs.forEach(function (q) { if (q.isFollowup && q.parentN != null) { (followsByParent[q.parentN] = followsByParent[q.parentN] || []).push(q); } });

  lines.push("Preguntas y respuestas del candidato (transcripción automática por voz; puede tener errores menores, evaluá contenido e intención).");
  lines.push("IMPORTANTE: cuando una pregunta principal tiene REPREGUNTA(S) de profundización, evaluá la pregunta Y su(s) repregunta(s) EN CONJUNTO y asignales UN SOLO puntaje (el de esa pregunta principal).");
  lines.push("");
  mains.forEach(function (q) {
    var lg = (q.lang && q.lang !== "es") ? q.lang : null;
    if (lg) otherLangs[lg] = true;
    var langTag = lg ? (" [PREGUNTA EN " + ((LANGNAME[lg] || lg).toUpperCase()) + " — la respuesta DEBE estar en " + (LANGNAME[lg] || lg) + "]") : "";
    lines.push("Pregunta " + q.n + " [" + (q.category || "") + "]" + langTag + ": " + (q.text || ""));
    var t = (q.transcript || "").trim();
    lines.push("Respuesta: " + (t ? t : "(sin respuesta / no respondió)"));
    if (q.durationSec != null) lines.push("(duración: " + q.durationSec + "s)");
    var fus = followsByParent[q.n] || [];
    fus.forEach(function (fu) {
      lines.push("   ↳ Repregunta (profundización de esta misma pregunta): " + (fu.text || ""));
      var ft = (fu.transcript || "").trim();
      lines.push("   ↳ Respuesta a la repregunta: " + (ft ? ft : "(sin respuesta)"));
    });
    lines.push("");
  });
  lines.push("Analizá con criterio profesional y exigente, acorde al seniority. Puntuá CADA pregunta principal del 1 al 10 según la calidad, profundidad y pertinencia de la respuesta (contando la repregunta si la hay). No infles puntajes: una respuesta vacía, de una palabra o que no responde debe puntuar 1-2. El puntaje GENERAL surge del conjunto de todas las preguntas.");
  var langList = Object.keys(otherLangs).map(function (k) { return LANGNAME[k] || k; });
  if (langList.length) {
    lines.push("");
    lines.push("EVALUACIÓN DE IDIOMA. Algunas preguntas están en " + langList.join(", ") + " y el candidato DEBE responderlas en ese idioma. Para esas preguntas evaluá SERIAMENTE el nivel real del candidato en ese idioma: fluidez, gramática, vocabulario, coherencia y naturalidad (según la transcripción). REGLAS: si respondió en español, muy en cortado, con una sola palabra, o no respondió una pregunta que estaba en otro idioma, su nivel en ese idioma es bajo o 'No demostrado', y eso debe reflejarse. No regales nivel: solo un nivel alto si realmente respondió con soltura en ese idioma.");
    lines.push("Completá el campo \"language\" del JSON con esa evaluación. Si NO hubiera preguntas en otro idioma, poné \"language\": null.");
  }
  lines.push("Devolvé EXCLUSIVAMENTE un JSON con esta forma:");
  lines.push('{ "score": (1 a 10, medio punto ok — puntaje GENERAL que surge de todas las preguntas), "veredicto": ("Aprobado"|"Medio"|"Desaprobado" — coherente con el score: score>=7 => "Aprobado"; score entre 5 y 6.9 => "Medio"; score<5 => "Desaprobado"), "overall": (2-4 oraciones), "perQuestion": [ { "n": (número de la pregunta PRINCIPAL), "score": (1 a 10, medio punto ok; si tiene repregunta, este único puntaje evalúa pregunta+repregunta juntas), "assessment": (1-2 oraciones justificando el puntaje) } ], "strengths": [..max 5..], "improve": [..max 5..], "probes": [..2-3..], "language": ' + (langList.length ? '{ "lang": ("' + langList.join('"|"') + '"), "level": ("No demostrado"|"Básico"|"Intermedio"|"Avanzado"|"Nativo/Bilingüe"), "answeredInLanguage": (true|false), "comment": (1-2 oraciones sobre el nivel real) }' : "null") + " }");
  lines.push("Incluí en perQuestion UNA entrada por cada pregunta PRINCIPAL (no una por repregunta).");
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
  lines.push("REGLAS DE COHERENCIA (MUY IMPORTANTE, no las rompas):");
  lines.push("- Antes de escribir cada pregunta, verificá que tenga sentido REAL para alguien en ESTE puesto y ESTE nivel. Si una pregunta no aplicaría a esta persona en la vida real, NO la hagas.");
  lines.push("- Coherencia jerárquica: si el puesto es gerencial/de jefatura, la persona LIDERA y es la máxima instancia de su área: preguntá por conducción de equipos, decisiones de alto impacto, presupuesto, indicadores, manejo de conflictos y estrategia. NUNCA le preguntes qué haría 'si un cliente quiere hablar con un superior' ni la trates como si tuviera un jefe operativo por encima para escalar cada tema.");
  lines.push("- Si el puesto es junior/sin gente a cargo, NO preguntes sobre liderar equipos, despedir personal, definir presupuestos ni decisiones estratégicas que no le corresponden.");
  lines.push("- Coherencia con el rubro y las tareas: las preguntas tienen que ser propias del día a día de ESE puesto (un vendedor de mostrador, un desarrollador, un gerente y un administrativo viven realidades distintas). Nada de preguntas genéricas que sirvan para cualquier trabajo.");
  lines.push("");
  lines.push("Generá exactamente " + n + " preguntas ESENCIALES, ORIGINALES y REALISTAS, como en una entrevista real de este puesto. Requisitos:");
  lines.push("- Que cada entrevista sea DISTINTA: variá el enfoque, el orden y la redacción. No uses fórmulas ni preguntas de relleno repetidas.");
  lines.push("- Cubrí: experiencia real y logros concretos, competencias específicas del rol, uno o dos casos situacionales reales del puesto y su nivel, y motivación/encaje con la empresa.");
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

// Modelo principal + respaldos por si Google retira alguno.
var MODEL_FALLBACKS = [MODEL, "gemini-flash-latest", "gemini-2.5-flash"];
async function callOneModel(model, key, parts, maxTokens, temp, thinkingOff) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key);
  var gen = { temperature: (temp == null ? 0.5 : temp), responseMimeType: "application/json", maxOutputTokens: maxTokens || 4096 };
  // Los modelos "pensantes" (2.5 / 3.x) gastan tokens en razonar y pueden cortar la respuesta.
  // Para tareas de JSON directo apagamos ese modo así devuelven el resultado completo.
  if (thinkingOff) gen.thinkingConfig = { thinkingBudget: 0 };
  var r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: gen })
  });
  var data = await r.json();
  return { ok: r.ok, status: r.status, data: data };
}
function modelUnavailable(res) {
  if (res.status === 404) return true;
  var msg = (res.data && res.data.error && res.data.error.message) || "";
  return /no longer available|is not found|not supported|update your code/i.test(msg);
}
async function callGemini(key, parts, maxTokens, temp) {
  var last = null;
  for (var i = 0; i < MODEL_FALLBACKS.length; i++) {
    var model = MODEL_FALLBACKS[i];
    // 1) Intento con el modo "pensante" apagado (respuesta directa, más confiable para JSON).
    var res = await callOneModel(model, key, parts, maxTokens, temp, true);
    // Si el modelo no acepta thinkingConfig (400), reintento sin ese campo.
    if (!res.ok && res.status === 400) {
      res = await callOneModel(model, key, parts, maxTokens, temp, false);
    }
    if (res.ok) return res;
    last = res;
    // Solo probamos el siguiente modelo si el problema es que este no existe/está retirado.
    if (!modelUnavailable(res)) return res;
  }
  return last;
}
function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  var cleaned = String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (e2) { return null; }
}
function extractText(data) {
  try {
    var parts = (data.candidates[0].content.parts) || [];
    var t = "";
    for (var i = 0; i < parts.length; i++) { if (parts[i] && typeof parts[i].text === "string") t += parts[i].text; }
    return t;
  } catch (e) { return ""; }
}

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

  // Rate limit: máx. 25 llamadas cada 10 minutos por IP (protege la cuota de Gemini).
  if (rateLimited("ai:" + clientIp(req), 25, 10 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }

  try {
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    // Validación / saneo de entrada para no mandar payloads gigantes al modelo.
    if (body.position) body.position = String(body.position).slice(0, 200);
    if (body.company) body.company = String(body.company).slice(0, 400);
    if (body.focus) body.focus = String(body.focus).slice(0, 600);
    if (body.level) body.level = String(body.level).slice(0, 40);
    if (body.cvText) body.cvText = String(body.cvText).slice(0, 12000);
    if (body.companyUrl) body.companyUrl = String(body.companyUrl).slice(0, 300);
    if (Array.isArray(body.questions)) {
      body.questions = body.questions.slice(0, 15).map(function (q) {
        q = q || {};
        return {
          text: String(q.text || "").slice(0, 1000),
          category: String(q.category || "").slice(0, 60),
          transcript: String(q.transcript || "").slice(0, 6000),
          durationSec: (typeof q.durationSec === "number" ? q.durationSec : null)
        };
      });
    }

    if (body.task === "screen") {
      var pos = String(body.position || "").slice(0, 200);
      var desc = String(body.description || "").slice(0, 4000);
      var cvs = Array.isArray(body.cvs) ? body.cvs.slice(0, 25).map(function (c) {
        c = c || {};
        return { id: String(c.id || "").slice(0, 80), name: String(c.name || "").slice(0, 140), text: String(c.text || "").slice(0, 4000) };
      }).filter(function (c) { return c.id; }) : [];
      if (!cvs.length) { res.status(200).json({ ok: false, error: "no_cvs" }); return; }
      var mustReq = String(body.must || "").slice(0, 1500);
      var niceReq = String(body.nice || "").slice(0, 1500);
      var gs = await callGemini(key, [{ text: screeningPrompt(pos, desc, cvs, mustReq, niceReq) }], 8192, 0.3);
      if (!gs.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gs.data && gs.data.error && gs.data.error.message) || ("HTTP " + gs.status) }); return; }
      var parsedS = parseJson(extractText(gs.data));
      var ranked = parsedS && Array.isArray(parsedS.ranking) ? parsedS.ranking : null;
      if (!ranked || !ranked.length) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, ranking: ranked });
      return;
    }

    if (body.task === "questions") {
      var companyWeb = body.companyUrl ? await fetchCompanyWeb(body.companyUrl) : "";
      var parts = [{ text: questionsPrompt(body, companyWeb) }];
      // Respaldo: si mandaron el CV como archivo (base64) y es chico, lo adjuntamos también.
      if ((!body.cvText || body.cvText.length < 40) && body.cv && body.cv.data && body.cv.data.length < 3500000) {
        parts.push({ inline_data: { mime_type: (body.cv.mimeType || "application/pdf"), data: body.cv.data } });
      }
      var g = await callGemini(key, parts, 8192, 0.85);
      if (!g.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (g.data && g.data.error && g.data.error.message) || ("HTTP " + g.status) }); return; }
      var parsedQ = parseJson(extractText(g.data));
      var qsr = parsedQ && Array.isArray(parsedQ.questions) ? parsedQ.questions : null;
      if (!qsr || !qsr.length) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, questions: qsr, usedCV: !!(body.cvText && body.cvText.length >= 40), usedWeb: !!companyWeb });
      return;
    }

    if (body.task === "followup") {
      var fq = String(body.question || "").slice(0, 1000);
      var fa = String(body.answer || "").slice(0, 4000);
      var gf = await callGemini(key, [{ text: followupPrompt({ question: fq, answer: fa, position: body.position, level: body.level, language: body.language }) }], 300, 0.5);
      if (!gf.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gf.data && gf.data.error && gf.data.error.message) || ("HTTP " + gf.status) }); return; }
      var pf = parseJson(extractText(gf.data));
      var fu = pf && pf.followup ? String(pf.followup).slice(0, 300) : "";
      if (!fu) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, followup: fu });
      return;
    }

    if (body.task === "transcribe") {
      var au = body.audio;
      if (!au || !au.data) { res.status(200).json({ ok: false, error: "no_audio" }); return; }
      var mt = String(au.mimeType || "audio/webm").split(";")[0].trim();
      var LNT = { es: "español", en: "inglés", pt: "portugués", fr: "francés", it: "italiano", de: "alemán" };
      var expected = LNT[body.language] || "español";
      var tprompt = "Escuchá este audio de una entrevista laboral y TRANSCRIBÍ TEXTUALMENTE lo que dice la persona, palabra por palabra. " +
        "La consigna esperaba una respuesta en " + expected + ", pero transcribí EXACTAMENTE en el idioma que la persona realmente habla (por ejemplo, si habla en inglés, transcribí en inglés). NO traduzcas. " +
        "Si el audio está vacío, en silencio o no hay voz humana entendible, devolvé el texto vacío. " +
        'Devolvé EXCLUSIVAMENTE un JSON con esta forma: { "transcript": "texto transcripto aquí" }';
      var tparts = [ { text: tprompt }, { inline_data: { mime_type: mt, data: au.data } } ];
      var gtr = await callGemini(key, tparts, 1500, 0.0);
      if (!gtr.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gtr.data && gtr.data.error && gtr.data.error.message) || ("HTTP " + gtr.status) }); return; }
      var ptr = parseJson(extractText(gtr.data));
      var tr = (ptr && typeof ptr.transcript === "string") ? ptr.transcript : "";
      res.status(200).json({ ok: true, transcript: String(tr).slice(0, 8000) });
      return;
    }

    var ga = await callGemini(key, [{ text: analysisPrompt(body) }], 8192, 0.4);
    if (!ga.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (ga.data && ga.data.error && ga.data.error.message) || ("HTTP " + ga.status) }); return; }
    var parsed = parseJson(extractText(ga.data));
    if (!parsed) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
    res.status(200).json({ ok: true, analysis: parsed });
  } catch (e) {
    res.status(200).json({ ok: false, error: "exception", detail: String(e && e.message || e) });
  }
};
