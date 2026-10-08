import "server-only";

export type DilemmaOption = {
  id: "a" | "b" | "c" | "d";
  text: string;
  /** Por qué esta opción funciona o no. Se muestra después de votar. */
  why: string;
};

export type Dilemma = {
  id: string;
  area: "Liderazgo" | "Conflicto en el equipo" | "Ética" | "Comunicación";
  title: string;
  situation: string;
  question: string;
  options: DilemmaOption[];
  best: DilemmaOption["id"];
  /** El principio de liderazgo detrás de la mejor respuesta. */
  principle: string;
  /** Explicación teórica y práctica de la mejor respuesta. */
  explanation: string;
};

export const dilemmas: Dilemma[] = [
  {
    id: "credito-ajeno",
    area: "Conflicto en el equipo",
    title: "Se llevó el crédito",
    situation:
      "En la reunión con la gerencia, un compañero presentó como propia una idea que vos le habías contado la semana pasada. La gerencia lo felicitó.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Lo interrumpís en la reunión y aclarás que la idea fue tuya.", why: "Puede ser justo, pero exponerlo en público genera un conflicto abierto y te hace ver reactivo." },
      { id: "b", text: "Hablás a solas con él, le contás cómo lo viviste y acuerdan cómo reconocer los aportes de ahora en más.", why: "Separás el problema de la persona, le das la chance de corregirlo y cuidás la relación." },
      { id: "c", text: "No decís nada para evitar problemas, pero dejás de compartirle ideas.", why: "Evitar el conflicto lo deja sin resolver y deteriora la confianza del equipo." },
      { id: "d", text: "Le escribís a la gerencia por mail con la prueba de que la idea era tuya.", why: "Escalar antes de hablar con la persona rompe la confianza y suele leerse como una jugada política." },
    ],
    best: "b",
    principle: "Primero en privado, con hechos y sin acusar.",
    explanation:
      "Ante un conflicto entre pares, lo más efectivo suele ser una conversación privada y directa: describís el hecho, contás cómo te afectó y pedís algo concreto. Si no funciona, recién ahí tiene sentido escalar. Además, a futuro conviene dejar registro de tus ideas (un mail, un documento compartido) para que el reconocimiento no dependa de nadie.",
  },
  {
    id: "estrella-toxica",
    area: "Liderazgo",
    title: "El mejor vendedor maltrata al equipo",
    situation:
      "Liderás un equipo comercial. Tu vendedor con mejores resultados trata mal a los demás: los interrumpe, se burla en las reuniones y dos personas ya se quejaron con vos.",
    question: "¿Qué hacés como líder?",
    options: [
      { id: "a", text: "Nada: trae la mitad de las ventas y no podés arriesgarte a perderlo.", why: "Tolerar la conducta le dice al equipo que los resultados justifican todo. Suele costar más (rotación, clima) de lo que aporta." },
      { id: "b", text: "Lo despedís de inmediato para dar el ejemplo.", why: "Saltear la conversación y la oportunidad de cambiar es injusto y riesgoso." },
      { id: "c", text: "Le das feedback claro sobre la conducta y su impacto, fijás expectativas y un plazo, y hacés seguimiento.", why: "Separa resultados de conducta, le da una oportunidad concreta y deja claras las consecuencias." },
      { id: "d", text: "Le pedís a los demás que tengan paciencia, que es su forma de ser.", why: "Traslada el problema a las víctimas y legitima el maltrato." },
    ],
    best: "c",
    principle: "El cómo importa tanto como el qué.",
    explanation:
      "Un buen líder evalúa resultados y conductas. El feedback debe ser específico (qué hizo, en qué reunión, qué impacto tuvo), con una expectativa clara de cambio, un plazo y seguimiento. Si la conducta no cambia, las consecuencias tienen que ser reales: si no, el equipo aprende que las reglas no son para todos.",
  },
  {
    id: "error-propio",
    area: "Ética",
    title: "Tu error nadie lo vio",
    situation:
      "Descubrís que un informe que mandaste al cliente la semana pasada tenía un error en un número. Nadie se dio cuenta todavía.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Lo corregís en silencio en la próxima versión y no decís nada.", why: "Si el cliente ya tomó decisiones con ese número, el silencio puede costarle caro y, si se descubre, tu credibilidad también." },
      { id: "b", text: "Avisás a tu jefe y al cliente, explicás el impacto y mandás la corrección.", why: "Asumir el error rápido protege al cliente y construye confianza a largo plazo." },
      { id: "c", text: "Esperás a ver si alguien lo nota.", why: "Postergar aumenta el daño y te deja peor parado si sale a la luz." },
      { id: "d", text: "Le echás la culpa al sistema que generó los datos.", why: "Desviar la responsabilidad es deshonesto y el equipo lo percibe." },
    ],
    best: "b",
    principle: "Hacerse cargo rápido genera más confianza que no equivocarse nunca.",
    explanation:
      "La transparencia ante los errores propios es uno de los comportamientos que más confianza construyen. La fórmula: reconocer el error sin excusas, explicar el impacto, proponer la corrección y contar qué vas a hacer para que no se repita.",
  },
  {
    id: "dos-que-no-se-hablan",
    area: "Conflicto en el equipo",
    title: "Dos personas que no se hablan",
    situation:
      "Dos personas de tu equipo tuvieron una discusión fuerte y ahora se comunican solo por mail, con copia a todos. El trabajo conjunto se está atrasando.",
    question: "¿Cuál es el mejor primer paso como líder?",
    options: [
      { id: "a", text: "Esperás a que se les pase solo.", why: "Los conflictos entre personas rara vez se resuelven solos y el atraso ya afecta al equipo." },
      { id: "b", text: "Los juntás a los dos en una reunión con todo el equipo para resolverlo.", why: "Exponerlos en público aumenta la tensión y la necesidad de 'ganar'." },
      { id: "c", text: "Hablás primero con cada uno por separado y después facilitás una charla entre los dos, enfocada en cómo van a trabajar.", why: "Escuchar por separado baja la defensiva; la charla conjunta se centra en acuerdos de trabajo, no en quién tuvo razón." },
      { id: "d", text: "Decidís vos quién tenía razón y se lo comunicás a los dos.", why: "Hacer de juez sin entender el conflicto suele dejar a uno resentido y no cambia la dinámica." },
    ],
    best: "c",
    principle: "El líder facilita, no juzga.",
    explanation:
      "La mediación suele funcionar en dos tiempos: primero escuchar a cada parte en privado (qué pasó, qué necesita), después una conversación conjunta orientada al futuro, con acuerdos concretos de cómo van a trabajar juntos (canales, plazos, quién decide qué).",
  },
  {
    id: "promesa-imposible",
    area: "Ética",
    title: "Tu jefe promete algo imposible",
    situation:
      "Tu jefe le promete a un cliente una fecha de entrega que vos sabés que el equipo no puede cumplir. Te pide que no digas nada.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "No decís nada: es su decisión.", why: "Callarte deja al equipo y al cliente expuestos a un incumplimiento que ya ves venir." },
      { id: "b", text: "Le decís al cliente la fecha real a espaldas de tu jefe.", why: "Desautorizar a tu jefe frente al cliente rompe la relación y la cadena de confianza." },
      { id: "c", text: "Hablás en privado con tu jefe, le mostrás los datos del riesgo y le proponés alternativas para plantearle al cliente.", why: "Planteás el problema a quien corresponde, con datos y con soluciones." },
      { id: "d", text: "Le pedís al equipo horas extra sin decirle nada a nadie.", why: "Es tapar el problema a costa del equipo y probablemente no alcance." },
    ],
    best: "c",
    principle: "Desacordar en privado, con datos y alternativas.",
    explanation:
      "Disentir con un superior no es deslealtad: es responsabilidad profesional. Lo efectivo es hacerlo en privado, con datos concretos (capacidad del equipo, riesgos) y alternativas viables (entrega por partes, fecha nueva). Si aun así decide mantenerlo, al menos el riesgo quedó explicitado.",
  },
  {
    id: "nuevo-lider-veterano",
    area: "Liderazgo",
    title: "Liderar a quien quería tu puesto",
    situation:
      "Te ascendieron a líder del equipo. Una compañera con más antigüedad también se había postulado y ahora está distante y cuestiona tus decisiones en las reuniones.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Ignorás la situación y esperás que se adapte.", why: "La tensión no resuelta se contagia al resto del equipo." },
      { id: "b", text: "Le pedís una charla a solas, reconocés su experiencia, le preguntás qué le gustaría y acuerdan cómo trabajar juntos.", why: "Reconocer su valor y darle un rol desde el principio convierte a una posible opositora en aliada." },
      { id: "c", text: "Le marcás en público que ahora el líder sos vos.", why: "Imponer autoridad en público genera resistencia y quiebra la relación." },
      { id: "d", text: "Le sacás responsabilidades para que no te haga sombra.", why: "Desperdiciás talento y confirmás la sospecha de que la relación es una competencia." },
    ],
    best: "b",
    principle: "La autoridad se gana con respeto, no con jerarquía.",
    explanation:
      "Al asumir un liderazgo, es clave tener conversaciones uno a uno, sobre todo con quienes pueden sentirse desplazados. Reconocer su experiencia, preguntar por sus intereses y darle un rol de peso (por ejemplo, referente técnico) suele transformar la tensión en colaboración.",
  },
  {
    id: "rumor",
    area: "Comunicación",
    title: "El rumor de despidos",
    situation:
      "Circula en la oficina el rumor de que van a despedir gente. Vos sabés que hay una reestructuración en análisis, pero todavía no hay nada decidido y te pidieron reserva.",
    question: "Tu equipo te pregunta directamente. ¿Qué respondés?",
    options: [
      { id: "a", text: "“No va a haber despidos, quédense tranquilos.”", why: "Prometer algo que no sabés destruye tu credibilidad si después pasa." },
      { id: "b", text: "“Sí, se viene una reestructuración grande.”", why: "Rompés la reserva y generás pánico con información incompleta." },
      { id: "c", text: "“Hay análisis en curso y no hay nada decidido. No puedo dar detalles, pero me comprometo a contarles apenas haya algo concreto.”", why: "Sos honesto sin romper la confidencialidad y das un compromiso concreto." },
      { id: "d", text: "Cambiás de tema y no respondés.", why: "El silencio alimenta el rumor y la desconfianza." },
    ],
    best: "c",
    principle: "Honestidad sobre lo que sabés y lo que no podés decir.",
    explanation:
      "En contextos de incertidumbre, el equipo valora la honestidad aunque la información sea incompleta. Se puede ser transparente sobre el proceso (hay un análisis, no hay decisiones) sin revelar lo confidencial, y comprometerse a comunicar cuando haya novedades. Nunca prometas lo que no controlás.",
  },
  {
    id: "regalo-proveedor",
    area: "Ética",
    title: "El regalo del proveedor",
    situation:
      "Estás evaluando tres proveedores para un contrato importante. Uno de ellos te manda de regalo dos entradas para un recital que querías ver.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Las aceptás: es un gesto y no va a influir en tu decisión.", why: "Aunque no influya, la apariencia de conflicto de interés ya daña tu imparcialidad." },
      { id: "b", text: "Las devolvés con un agradecimiento, lo informás según la política de la empresa y seguís la evaluación con los mismos criterios.", why: "Protegés la transparencia del proceso y la relación con el proveedor." },
      { id: "c", text: "Las aceptás y no se lo contás a nadie.", why: "Ocultarlo agrava la situación si sale a la luz." },
      { id: "d", text: "Descalificás a ese proveedor por intentar sobornarte.", why: "Puede ser desproporcionado: quizás no conocía la política. Conviene informar y evaluar con criterios objetivos." },
    ],
    best: "b",
    principle: "No solo ser imparcial: también parecerlo.",
    explanation:
      "En procesos de compra, los regalos durante una evaluación generan conflicto de interés aparente. La práctica recomendada es rechazarlos con cortesía, informarlo según la política de la empresa y mantener criterios de evaluación documentados para todos los proveedores.",
  },
  {
    id: "feedback-a-jefe",
    area: "Comunicación",
    title: "Tu jefe te interrumpe siempre",
    situation:
      "En cada reunión con clientes, tu jefe te interrumpe y termina tus explicaciones. Sentís que te deja mal parado.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Le pedís una charla a solas y le contás un ejemplo concreto, cómo te afecta y qué te ayudaría.", why: "Feedback hacia arriba en privado, específico y con un pedido claro." },
      { id: "b", text: "Lo interrumpís vos también para recuperar tu lugar.", why: "Escala la tensión frente al cliente y no resuelve nada." },
      { id: "c", text: "Te quejás con tus compañeros.", why: "No cambia nada y puede volver distorsionado." },
      { id: "d", text: "Dejás de hablar en las reuniones.", why: "Perdés visibilidad y el problema sigue." },
    ],
    best: "a",
    principle: "El feedback también se da hacia arriba.",
    explanation:
      "Para dar feedback a un superior funciona el mismo modelo que con pares: un ejemplo concreto (“en la reunión del martes con X...”), el impacto (“el cliente después me preguntaba a mí...”) y un pedido (“¿me dejarías terminar y después sumás?”). Hacerlo en privado y con intención de mejorar el trabajo conjunto lo vuelve mucho más fácil de escuchar.",
  },
  {
    id: "sobrecarga-equipo",
    area: "Liderazgo",
    title: "El equipo no da más",
    situation:
      "Tu equipo viene trabajando horas extra hace un mes. La dirección te pide sumar un proyecto nuevo con la misma gente.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Aceptás y le pedís al equipo un último esfuerzo.", why: "Sostener la sobrecarga lleva a errores, desgaste y renuncias." },
      { id: "b", text: "Le mostrás a la dirección la carga actual con datos y le pedís que priorice o asigne recursos.", why: "Hacés visible la capacidad real y devolvés la decisión de prioridad a quien corresponde." },
      { id: "c", text: "Rechazás el proyecto sin más explicación.", why: "Un no sin datos ni alternativas parece falta de compromiso." },
      { id: "d", text: "Aceptás y lo hacés vos solo de noche.", why: "No es sostenible y oculta el problema de capacidad." },
    ],
    best: "b",
    principle: "Proteger al equipo es parte del liderazgo.",
    explanation:
      "Un líder gestiona la capacidad del equipo como un recurso finito. Mostrar la carga con datos (proyectos, horas, plazos) y pedir que se prioricen o se sumen recursos transforma un “no puedo” en una decisión de negocio. Cuidar el bienestar del equipo también es cuidar los resultados.",
  },
  {
    id: "companero-bajo-rendimiento",
    area: "Conflicto en el equipo",
    title: "El compañero que no rinde",
    situation:
      "Un compañero de tu mismo nivel viene entregando trabajo incompleto y vos terminás completándolo. Tu líder no se dio cuenta.",
    question: "¿Cuál es el mejor primer paso?",
    options: [
      { id: "a", text: "Se lo contás a tu líder enseguida.", why: "Escalar sin hablar primero con la persona daña la confianza entre pares." },
      { id: "b", text: "Seguís completándolo para que el trabajo salga.", why: "Te sobrecargás y el problema se vuelve invisible." },
      { id: "c", text: "Hablás con él, le mostrás ejemplos concretos, preguntás qué le está pasando y acuerdan cómo seguir.", why: "Le das la chance de explicar y corregir, y quizás descubrís una causa que se puede resolver." },
      { id: "d", text: "Dejás que su parte salga mal para que se note.", why: "Perjudica al equipo y al cliente para probar un punto." },
    ],
    best: "c",
    principle: "Curiosidad antes que juicio.",
    explanation:
      "Detrás de un bajo rendimiento suele haber algo: sobrecarga, falta de claridad, un problema personal. Preguntar antes de juzgar abre la conversación. Si después de hablarlo no cambia, ahí sí corresponde involucrar al líder, con hechos concretos.",
  },
  {
    id: "decision-impopular",
    area: "Liderazgo",
    title: "Una decisión que no te gusta",
    situation:
      "La empresa decidió volver a la presencialidad tres días por semana. Vos no estás de acuerdo, pero te toca comunicárselo a tu equipo.",
    question: "¿Cómo lo comunicás?",
    options: [
      { id: "a", text: "“Me bajaron esto, yo no estoy de acuerdo, pero es lo que hay.”", why: "Desligarte socava la decisión y tu rol de líder." },
      { id: "b", text: "Explicás la decisión y sus motivos, reconocés el impacto, escuchás las preocupaciones y ves qué margen hay para adaptarla.", why: "Comunicás con transparencia, mostrás empatía y buscás soluciones dentro del marco." },
      { id: "c", text: "Mandás un mail con la nueva política y listo.", why: "Pierde la oportunidad de escuchar y genera más resistencia." },
      { id: "d", text: "Decís que fue idea tuya para mostrarte alineado.", why: "Es deshonesto y el equipo probablemente lo note." },
    ],
    best: "b",
    principle: "Comprometerse con la decisión sin negar el impacto.",
    explanation:
      "Un líder puede no estar de acuerdo con una decisión y aun así comunicarla con compromiso: explicando el porqué, reconociendo lo que cuesta, escuchando y buscando el margen de flexibilidad (qué días, excepciones). Tu desacuerdo se plantea hacia arriba, no hacia el equipo.",
  },
  {
    id: "reunion-que-se-desvia",
    area: "Comunicación",
    title: "La reunión que se va de tema",
    situation:
      "Coordinás una reunión de 30 minutos para decidir un presupuesto. A los 15 minutos, dos personas se enganchan en una discusión sobre otro tema.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Los dejás terminar: si les importa, por algo es.", why: "La reunión pierde su objetivo y el resto pierde tiempo." },
      { id: "b", text: "Reconocés que el tema es importante, lo anotás para tratarlo aparte y volvés al objetivo de la reunión.", why: "Valida a las personas y protege el objetivo y el tiempo de todos." },
      { id: "c", text: "Los cortás en seco: “eso no tiene nada que ver”.", why: "Resuelve el desvío pero puede hacer sentir descartadas a las personas." },
      { id: "d", text: "Terminás la reunión y la reprogramás.", why: "Desperdicia el tiempo invertido sin intentar reencauzar." },
    ],
    best: "b",
    principle: "Proteger el objetivo sin descalificar a nadie.",
    explanation:
      "Una técnica simple es el “estacionamiento” (parking lot): anotar a la vista los temas que surgen fuera del objetivo para tratarlos después. Así las personas se sienten escuchadas y la reunión recupera el foco. Empezar cada reunión con el objetivo explícito ayuda a que esto sea natural.",
  },
  {
    id: "favoritismo",
    area: "Ética",
    title: "Tu amigo en el equipo",
    situation:
      "Liderás un equipo en el que trabaja un amigo tuyo de muchos años. Hay que elegir quién lidera un proyecto visible y él quiere hacerlo, pero otra persona está mejor preparada.",
    question: "¿Qué hacés?",
    options: [
      { id: "a", text: "Se lo das a tu amigo: confiás en él.", why: "Elegir por afinidad y no por criterios afecta la justicia percibida y la motivación del resto." },
      { id: "b", text: "Elegís a quien está mejor preparada con criterios claros, se lo explicás a tu amigo en privado y le proponés cómo prepararse para la próxima.", why: "Decisión justa y transparente que además cuida la relación." },
      { id: "c", text: "Hacés un sorteo para no tener que decidir.", why: "Evita la decisión que te corresponde como líder." },
      { id: "d", text: "Elegís a la otra persona sin explicarle nada a tu amigo.", why: "La decisión es correcta, pero la falta de conversación puede dañar la relación." },
    ],
    best: "b",
    principle: "Criterios claros, iguales para todos.",
    explanation:
      "Las decisiones de un líder tienen que poder explicarse con criterios objetivos (experiencia, habilidades, desarrollo). Cuando hay un vínculo personal, la transparencia es todavía más importante. Explicarle la decisión en privado y darle un camino de desarrollo cuida la amistad sin sacrificar la equidad.",
  },
];

/** Fecha de hoy en Argentina, como "AAAA-MM-DD". */
export function todayAR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** El dilema de un día: rotan en orden, uno por día, igual para todos. */
export function dilemmaFor(day: string): Dilemma {
  const days = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return dilemmas[((days % dilemmas.length) + dilemmas.length) % dilemmas.length];
}

export function getDilemma(id: string): Dilemma | undefined {
  return dilemmas.find((d) => d.id === id);
}

/** Lo que ve el navegador antes de votar: sin la respuesta ni las explicaciones. */
export type PublicDilemma = Pick<Dilemma, "id" | "area" | "title" | "situation" | "question"> & {
  options: { id: DilemmaOption["id"]; text: string }[];
};

export function toPublicDilemma(d: Dilemma): PublicDilemma {
  return {
    id: d.id,
    area: d.area,
    title: d.title,
    situation: d.situation,
    question: d.question,
    options: d.options.map(({ id, text }) => ({ id, text })),
  };
}
