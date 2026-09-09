// Función serverless (Vercel) — usa Google Gemini (nivel gratuito).
// Tareas:
//   - task: "questions" -> genera preguntas a medida (puesto, empresa, CV, web, dificultad por nivel)
//   - task: "mentor_cv"  -> analiza el CV del candidato y lo reescribe para el puesto que busca
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
/* ============================================================
   MENTOR IA · el producto para el candidato
   Misma casa, otra vara: acá la IA no filtra postulantes, entrena a
   una persona que tiene una entrevista esta semana.
   ============================================================ */
var MENTOR_LEVELS = {
  junior: "sin experiencia o hasta 2 años",
  semi: "entre 2 y 5 años de experiencia",
  senior: "más de 5 años de experiencia, con gente a cargo o proyectos propios"
};
/* Las preguntas del simulacro. Mezcla obligatoria para que no salgan
   seis preguntas de la misma familia. */
function mentorQuestionsPrompt(b, companyWeb) {
  var pos = String(b.position || "").slice(0, 200);
  var comp = String(b.company || "").slice(0, 160);
  var lvl = MENTOR_LEVELS[String(b.level || "semi")] || MENTOR_LEVELS.semi;
  var jd = String(b.jobDesc || "").slice(0, 4000);
  var cv = String(b.cvText || "").slice(0, 6000);
  var n = Math.min(8, Math.max(4, parseInt(b.count, 10) || 6));
  return "Sos un entrevistador de RR.HH. con veinte años de oficio, en Argentina. " +
    "Vas a tomarle una entrevista de práctica a alguien que se postula a: " + pos + ".\n" +
    (comp ? ("La empresa es: " + comp + ".\n") : "") +
    "Nivel de la persona: " + lvl + ".\n" +
    (jd ? ("\nDESCRIPCIÓN DEL PUESTO (usala para que las preguntas sean de ESTE puesto y no genéricas):\n\"\"\"\n" + jd + "\n\"\"\"\n") : "") +
    (cv ? ("\nCV DE LA PERSONA (hacé al menos una pregunta sobre algo concreto que figure acá):\n\"\"\"\n" + cv + "\n\"\"\"\n") : "") +
    (companyWeb ? ("\nINFO DE LA WEB DE LA EMPRESA:\n\"\"\"\n" + companyWeb.slice(0, 3000) + "\n\"\"\"\n") : "") +
    "\nArmá " + n + " preguntas para hacerle EN VOZ ALTA, en este orden:\n" +
    "1) Una de apertura tipo \"contame de vos\" adaptada al puesto.\n" +
    "2) Dos de experiencia concreta (que la obliguen a dar un ejemplo real, con situación, acción y resultado).\n" +
    "3) Una técnica o de conocimiento propia del puesto, al nivel indicado.\n" +
    "4) Una incómoda pero justa (un hueco del CV, un cambio de rubro, por qué se fue, cómo maneja un conflicto).\n" +
    "5) Una de motivación y encaje con la empresa o el puesto.\n" +
    "Si pediste más de 6, sumá más de experiencia concreta.\n\n" +
    "REGLAS:\n" +
    "- Español rioplatense, de vos. Como se habla, no como se escribe.\n" +
    "- Una sola pregunta por ítem. Cortas: se tienen que poder escuchar y entender de una.\n" +
    "- Nada de preguntas trampa ni acertijos.\n" +
    "- \"criterio\" es qué tendría que tener una buena respuesta a ESA pregunta: es lo que se usa después para corregir.\n" +
    "- \"seconds\" es cuánto tiempo darle para responder (60 a 150 según qué tan compleja sea).\n\n" +
    "Devolvé EXCLUSIVAMENTE este JSON:\n" +
    '{ "questions": [ { "text": "", "category": "Presentación|Experiencia|Competencias|Técnica|Motivación", "criterio": "", "seconds": 90 } ] }';
}
/* El informe. Acá está el producto: la nota importa menos que la
   evidencia y la reescritura. */
function mentorReportPrompt(b) {
  var pos = String(b.position || "").slice(0, 200);
  var comp = String(b.company || "").slice(0, 160);
  var lvl = MENTOR_LEVELS[String(b.level || "semi")] || MENTOR_LEVELS.semi;
  var bloques = (Array.isArray(b.answers) ? b.answers : []).slice(0, 12).map(function (a, i) {
    var sg = a.signals || {};
    var medido = [];
    if (sg.durationSec != null) medido.push("habló " + Math.round(sg.durationSec) + "s");
    if (sg.words != null) medido.push(sg.words + " palabras");
    if (sg.fillers) medido.push(sg.fillers + " muletillas");
    if (sg.longestSilence) medido.push("silencio más largo " + sg.longestSilence + "s");
    if (sg.wpm) medido.push(Math.round(sg.wpm) + " palabras/min");
    return "PREGUNTA " + (i + 1) + ": " + String(a.question || "").slice(0, 500) + "\n" +
      (a.criterio ? ("Qué se esperaba: " + String(a.criterio).slice(0, 400) + "\n") : "") +
      "RESPUESTA (transcripción textual): " + (String(a.transcript || "").slice(0, 3000) || "[no contestó]") + "\n" +
      (medido.length ? ("Medido: " + medido.join(", ") + "\n") : "");
  }).join("\n");

  return "Sos un reclutador senior argentino devolviéndole una crítica honesta a alguien que practicó una entrevista para: " + pos + "." +
    (comp ? (" La empresa es " + comp + ".") : "") + " Nivel: " + lvl + ".\n\n" +
    "TU TRABAJO: decirle la verdad de manera útil. Ni felicitarlo de gusto ni destruirlo. " +
    "Si la respuesta fue floja, la nota tiene que ser floja: un informe amable que no sirve para nada es peor que no dárselo.\n\n" +
    "CÓMO PUNTUAR (1 a 10 por dimensión):\n" +
    "- claridad: ¿se entiende? ¿tiene estructura (situación, qué hizo, qué resultado)? 3=se va por las ramas y no cierra; 6=se entiende pero le sobra o le falta; 9=responde en partes y cierra con un resultado concreto.\n" +
    "- seguridad: ¿se planta? 3=se disculpa, duda de todo, se desdice; 6=firme por momentos; 9=dice \"esto no lo manejo, lo aprendería así\" sin pedir perdón tres veces.\n" +
    "- conocimiento: sustancia técnica para el nivel. 3=generalidades; 6=sabe pero no lo ejemplifica; 9=ejemplos concretos con herramientas, números o decisiones propias.\n" +
    "- actitud: energía y cómo habla de trabajos anteriores. 3=se queja, culpa a otros; 6=neutro; 9=cuenta un conflicto sin hablar mal de nadie.\n" +
    "- compatibilidad: encaje real con ESTE puesto. 3=podría estar postulándose a cualquier cosa; 9=conecta su experiencia con algo puntual del puesto o la empresa.\n\n" +
    "REGLAS QUE NO SE NEGOCIAN:\n" +
    "- Toda nota y todo punto flojo lleva \"evidencia\": una CITA TEXTUAL de lo que la persona dijo. Si no podés citar, no lo digas.\n" +
    "- Usá lo medido (muletillas, silencios, duración) para la nota de seguridad y claridad, y mencionalo con el número.\n" +
    "- En \"reescrituras\" tomá las DOS peores respuestas y reescribilas como las diría alguien que queda, usando LA EXPERIENCIA QUE LA PERSONA CONTÓ. No inventes logros que no dijo. Si no contó nada, marcá qué le tendría que haber puesto.\n" +
    "- Si no contestó una pregunta, eso pesa y se dice.\n" +
    "- Hablale de vos, en rioplatense, directo y sin vueltas. Nada de \"es importante destacar que\".\n\n" +
    "LAS RESPUESTAS:\n\"\"\"\n" + bloques + "\n\"\"\"\n\n" +
    "Devolvé EXCLUSIVAMENTE este JSON:\n" +
    '{ "score": 0, "titular": "", "resumen": "", ' +
    '"dimensiones": [ { "key": "claridad|seguridad|conocimiento|actitud|compatibilidad", "score": 0, "comentario": "", "evidencia": "" } ], ' +
    '"fortalezas": [ { "titulo": "", "detalle": "", "evidencia": "" } ], ' +
    '"mejoras": [ { "titulo": "", "detalle": "", "como": "" } ], ' +
    '"reescrituras": [ { "pregunta": "", "tuya": "", "mejor": "", "porque": "" } ], ' +
    '"preguntas_al_entrevistador": [ "" ], ' +
    '"si_fuera_real": "" }\n' +
    "\"score\" es de 0 a 10 con un decimal, coherente con las dimensiones. \"titular\" es una frase de 8 palabras que resuma la entrevista. " +
    "\"si_fuera_real\" es qué habría pasado si esta entrevista era de verdad, en una o dos frases sin anestesia. " +
    "3 fortalezas, 3 mejoras, 2 reescrituras y 4 preguntas para hacerle al entrevistador (específicas de este puesto, que dejen bien parada a la persona).";
}

/* ---- El CV, mirado y reescrito para UN puesto concreto ----
   La regla que gobierna todo lo de abajo es una sola: no inventar.
   Se puede reordenar, recortar, priorizar y decir mejor lo que la
   persona ya contó. Lo que falta se marca entre corchetes para que lo
   complete ella, nunca lo completa el modelo. */
function mentorCvPrompt(b) {
  var pos = String(b.position || "").slice(0, 200);
  var comp = String(b.company || "").slice(0, 160);
  var lvl = MENTOR_LEVELS[String(b.level || "semi")] || MENTOR_LEVELS.semi;
  var jd = String(b.jobDesc || "").slice(0, 4000);
  var cv = String(b.cvText || "").slice(0, 12000);
  return "Sos un reclutador senior argentino con veinte años de oficio leyendo CVs. " +
    "Te traen un CV y te piden dos cosas: la verdad sobre cómo compite para un puesto, y el mismo CV reescrito para ese puesto.\n\n" +
    "PUESTO AL QUE SE POSTULA: " + pos + ".\n" +
    (comp ? ("EMPRESA: " + comp + ".\n") : "") +
    "NIVEL DE LA PERSONA: " + lvl + ".\n" +
    (jd ? ("\nAVISO DEL PUESTO (es el criterio principal: el CV se adapta a ESTO):\n\"\"\"\n" + jd + "\n\"\"\"\n") : "") +
    "\nEL CV, TAL COMO ESTÁ HOY (texto extraído del archivo, puede venir desordenado):\n\"\"\"\n" + cv + "\n\"\"\"\n\n" +
    "PRIMERA PARTE · EL DIAGNÓSTICO\n" +
    "- \"score\" (0 a 10, un decimal) es qué tan bien compite el CV ORIGINAL para ESTE puesto, no lo buena que es la persona. Si el CV no tiene nada que ver con el puesto, es un 3, y se dice.\n" +
    "- \"primera_impresion\" es lo que piensa un reclutador en los siete segundos que le da a un CV antes de decidir si lo sigue leyendo. Una o dos frases, sin anestesia.\n" +
    "- En \"diagnostico\" van los seis frentes con su estado (bien / regular / mal) y por qué, citando algo puntual del CV.\n" +
    "- En \"palabras_clave\" van las del aviso (o, si no hay aviso, las propias del puesto): \"presentes\" las que ya figuran en el CV y \"faltantes\" las que el aviso pide y no aparecen. No pongas en faltantes nada que la persona no pueda tener de verdad.\n\n" +
    "SEGUNDA PARTE · EL CV ADAPTADO\n" +
    "REGLAS QUE NO SE NEGOCIAN:\n" +
    "1) PROHIBIDO INVENTAR. Ni un empleo, ni un título, ni una herramienta, ni un número que la persona no haya escrito. Todo lo que devuelvas tiene que poder rastrearse al CV original.\n" +
    "2) Si un logro pide un número que la persona no puso, escribí el bullet con el hueco a la vista: \"...reduciendo el tiempo de entrega en [completar: cuánto]\", y sumá ese hueco a \"completar\".\n" +
    "3) Los bullets empiezan con verbo en pasado, tienen una sola línea y cuentan qué hizo y qué resultado dejó. Entre 3 y 5 por experiencia, y arriba los que le sirven a ESTE puesto. Lo que no aporta al puesto se resume en uno solo o se cae.\n" +
    "4) La experiencia va de la más nueva a la más vieja, con los períodos tal como figuran en el original.\n" +
    "5) \"titulo\" es el título profesional con el que la persona se presenta para este puesto (ej: \"Analista de sistemas · Semi senior\"), escrito con lo que ella realmente es.\n" +
    "6) \"resumen\" son 3 o 4 líneas en primera persona sin decir \"yo\", apuntadas al puesto, hechas con la experiencia real que hay en el CV.\n" +
    "7) \"habilidades\" salen del CV, ordenadas por lo que pide el aviso primero.\n" +
    "8) Sacá del CV adaptado la edad, el estado civil, el DNI, la foto y la dirección exacta: no van y pueden jugar en contra. Si estaban, decilo en \"que_cambie\".\n" +
    "9) \"datos\" es el encabezado: \"nombre\" tal como figura y \"contacto\" en una línea (mail · teléfono · ciudad · LinkedIn) con lo que haya. Si no está, dejalo vacío y pedilo en \"completar\".\n" +
    "10) Español rioplatense, de vos, directo. Nada de \"proactivo\", \"sinergia\", \"orientado a resultados\" ni relleno que no diga nada.\n\n" +
    "Devolvé EXCLUSIVAMENTE este JSON:\n" +
    '{ "score": 0, "titular": "", "primera_impresion": "", ' +
    '"diagnostico": [ { "key": "foco|experiencia|logros|palabras_clave|redaccion|formato", "estado": "bien|regular|mal", "titulo": "", "detalle": "" } ], ' +
    '"palabras_clave": { "presentes": [""], "faltantes": [""] }, ' +
    '"arreglos": [ { "titulo": "", "detalle": "", "como": "" } ], ' +
    '"datos": { "nombre": "", "contacto": "" }, ' +
    '"cv": { "titulo": "", "resumen": "", ' +
    '"experiencia": [ { "puesto": "", "empresa": "", "periodo": "", "bullets": [""] } ], ' +
    '"educacion": [ { "titulo": "", "institucion": "", "periodo": "" } ], ' +
    '"habilidades": [""], "extras": [ { "titulo": "", "detalle": "" } ] }, ' +
    '"completar": [""], "que_cambie": [""] }\n' +
    "\"titular\" es una frase de 8 palabras que resuma el diagnóstico. " +
    "En \"arreglos\" van los 3 cambios que más mueven la aguja para este puesto, con el \"como\" bien concreto. " +
    "En \"que_cambie\" van, en una línea cada uno, los cambios que hiciste respecto del original y por qué. " +
    "En \"completar\" van los huecos que tiene que llenar la persona antes de mandarlo.";
}

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

    if (body.task === "mentor_questions") {
      var mPos = String(body.position || "").trim();
      if (!mPos) { res.status(200).json({ ok: false, error: "no_position" }); return; }
      var mWeb = body.companyUrl ? await fetchCompanyWeb(body.companyUrl) : "";
      var gmq = await callGemini(key, [{ text: mentorQuestionsPrompt(body, mWeb) }], 4096, 0.8);
      if (!gmq.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gmq.data && gmq.data.error && gmq.data.error.message) || ("HTTP " + gmq.status) }); return; }
      var pmq = parseJson(extractText(gmq.data));
      var mqs = pmq && Array.isArray(pmq.questions) ? pmq.questions : null;
      if (!mqs || !mqs.length) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, questions: mqs.slice(0, 8) });
      return;
    }

    if (body.task === "mentor_report") {
      if (!Array.isArray(body.answers) || !body.answers.length) { res.status(200).json({ ok: false, error: "no_answers" }); return; }
      var gmr = await callGemini(key, [{ text: mentorReportPrompt(body) }], 8192, 0.35);
      if (!gmr.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gmr.data && gmr.data.error && gmr.data.error.message) || ("HTTP " + gmr.status) }); return; }
      var pmr = parseJson(extractText(gmr.data));
      if (!pmr || typeof pmr !== "object" || !Array.isArray(pmr.dimensiones)) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, report: pmr });
      return;
    }

    // El CV del candidato: diagnóstico honesto + el mismo CV reescrito
    // para el puesto al que se postula. Nunca inventa experiencia.
    if (body.task === "mentor_cv") {
      var cvPos = String(body.position || "").trim();
      var cvTxt = String(body.cvText || "").trim();
      if (!cvPos) { res.status(200).json({ ok: false, error: "no_position" }); return; }
      if (cvTxt.length < 120) { res.status(200).json({ ok: false, error: "no_cv" }); return; }
      if (body.jobDesc) body.jobDesc = String(body.jobDesc).slice(0, 4000);
      var gcv = await callGemini(key, [{ text: mentorCvPrompt(body) }], 8192, 0.4);
      if (!gcv.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gcv.data && gcv.data.error && gcv.data.error.message) || ("HTTP " + gcv.status) }); return; }
      var pcv = parseJson(extractText(gcv.data));
      if (!pcv || typeof pcv !== "object" || !pcv.cv) { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, cv: pcv });
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

    if (body.task === "form_extract") {
      var dom = String(body.domain || "").slice(0, 40);
      var dtext = String(body.text || "").slice(0, 15000);
      if (!dtext) { res.status(200).json({ ok: false, error: "no_text" }); return; }
      var schema, guide;
      if (dom === "documentacion") {
        schema = '{ "type":"contrato|recibo|certificado|constancia|otro", "title":"", "doc_date":"YYYY-MM-DD", "expiry_date":"YYYY-MM-DD", "signed":true, "detail":"" }';
        guide = "Es un documento laboral (contrato, recibo de sueldo, certificado, constancia u otro). 'title' es una descripción corta. 'doc_date' es la fecha del documento y 'expiry_date' su vencimiento si lo tuviera. 'signed' es true si el documento está firmado (firma ológrafa o digital), si no false.";
      } else if (dom === "salud") {
        schema = '{ "type":"preocupacional|periodico|art|accidente|epp|apto", "subtype":"fisico|psicologico|ambiental|laboral|in_itinere|", "title":"", "entity":"", "result":"apto|apto_restricciones|no_apto|", "date":"YYYY-MM-DD", "expiry_date":"YYYY-MM-DD", "detail":"" }';
        guide = "Es un documento de salud ocupacional (apto médico, examen preocupacional o periódico, póliza/constancia de ART, entrega de EPP o denuncia de accidente). 'entity' es el prestador, clínica o ART. 'subtype' aplica solo a preocupacional (fisico/psicologico/ambiental) o accidente (laboral/in_itinere).";
      } else if (dom === "beneficios") {
        schema = '{ "title":"", "provider":"", "plan":"", "member_id":"", "amount":0, "installments":0, "installment_amount":0, "frequency":"mensual|trimestral|semestral|anual|unica", "start_date":"YYYY-MM-DD", "end_date":"YYYY-MM-DD", "expiry_date":"YYYY-MM-DD", "detail":"" }';
        guide = "Es un documento de un beneficio del empleado: credencial o constancia de obra social o prepaga, comunicacion de una bonificacion, convenio de un beneficio corporativo o solicitud de prestamo/adelanto. 'provider' es la entidad (obra social, prepaga, proveedor del beneficio). 'plan' es el plan o categoria, 'member_id' el numero de afiliado o socio. 'amount' es el importe principal (aporte, cuota, monto del bono o monto total del prestamo) como numero sin simbolos ni separadores de miles. Para prestamos, 'installments' es la cantidad de cuotas y 'installment_amount' el valor de cada cuota. 'expiry_date' es el vencimiento de la credencial o del convenio.";
      } else {
        schema = '{ "type":"curso|certificado|obligatoria", "title":"", "institution":"", "done_date":"YYYY-MM-DD", "expiry_date":"YYYY-MM-DD", "status":"pendiente|en_curso|completado", "detail":"" }';
        guide = "Es un certificado o constancia de un curso/capacitación. 'title' es el nombre del curso, 'institution' la entidad que lo emitió. Si es un certificado de finalización, status='completado'.";
      }
      var fprompt = "Sos un asistente que LEE un documento y extrae sus datos para completar un formulario. " + guide + "\n" +
        "Devolvé EXCLUSIVAMENTE un JSON válido con esta forma (dejá \"\" si un dato no aparece; las fechas SIEMPRE en formato YYYY-MM-DD):\n" + schema + "\n" +
        "No agregues explicaciones ni texto fuera del JSON.\n\nTEXTO DEL DOCUMENTO:\n\"\"\"\n" + dtext + "\n\"\"\"";
      var gfe = await callGemini(key, [{ text: fprompt }], 1024, 0.1);
      if (!gfe.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gfe.data && gfe.data.error && gfe.data.error.message) || ("HTTP " + gfe.status) }); return; }
      var pfe = parseJson(extractText(gfe.data));
      if (!pfe || typeof pfe !== "object") { res.status(200).json({ ok: false, error: "parse_error" }); return; }
      res.status(200).json({ ok: true, fields: pfe });
      return;
    }

    if (body.task === "assistant") {
      var apr = String(body.prompt || "").slice(0, 24000);
      if (!apr) { res.status(200).json({ ok: false, error: "no_prompt" }); return; }
      var gap = await callGemini(key, [{ text: apr }], 4096, 0.5);
      if (!gap.ok) { res.status(200).json({ ok: false, error: "gemini_error", detail: (gap.data && gap.data.error && gap.data.error.message) || ("HTTP " + gap.status) }); return; }
      var ans = extractText(gap.data) || "";
      res.status(200).json({ ok: true, answer: String(ans).slice(0, 12000) });
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
