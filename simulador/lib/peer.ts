/** Práctica entre pares: ejercicios de 15 minutos con un rol que practica y otro que evalúa. */

export type PeerRole = "practica" | "evalua";

export type ScriptStep = {
  /** Minuto de inicio y de fin dentro de los 15 minutos. */
  from: number;
  to: number;
  title: string;
  practica: string;
  evalua: string;
};

export type FeedbackQuestion = {
  id: string;
  label: string;
  kind: "escala" | "texto";
};

export type Exercise = {
  slug: string;
  title: string;
  skill: string;
  summary: string;
  roles: Record<PeerRole, string>;
  script: ScriptStep[];
  questions: FeedbackQuestion[];
};

const CLOSING_QUESTIONS: FeedbackQuestion[] = [
  { id: "funciono", label: "Lo que mejor funcionó (un ejemplo concreto)", kind: "texto" },
  { id: "cambiaria", label: "Una sola cosa que cambiaría la próxima vez", kind: "texto" },
];

export const exercises: Exercise[] = [
  {
    slug: "pitch",
    title: "Pitch de 2 minutos",
    skill: "Síntesis y persuasión",
    summary: "Presentás una idea en dos minutos, recibís feedback y la volvés a presentar mejorada.",
    roles: {
      practica: "Presentás una idea, un proyecto o a vos mismo en 2 minutos, dos veces.",
      evalua: "Escuchás sin interrumpir, tomás el tiempo y das feedback con la plantilla.",
    },
    script: [
      { from: 0, to: 2, title: "Preparación", practica: "Elegí el tema y anotá tres ideas: apertura, una prueba y un pedido final.", evalua: "Leé la plantilla de feedback para saber qué mirar." },
      { from: 2, to: 4, title: "Primer pitch", practica: "Presentá tu idea en 2 minutos.", evalua: "Escuchá sin interrumpir. Tomá el tiempo y anotá frases concretas." },
      { from: 4, to: 7, title: "Feedback", practica: "Escuchá sin defenderte. Podés hacer preguntas para entender.", evalua: "Contale una cosa que funcionó y una que cambiarías, con ejemplos." },
      { from: 7, to: 9, title: "Segundo pitch", practica: "Volvé a presentar aplicando el feedback.", evalua: "Fijate si aplicó el cambio." },
      { from: 9, to: 13, title: "Feedback final", practica: "Contá qué sentiste distinto en el segundo intento.", evalua: "Compará los dos intentos y completá la plantilla en Ensayo." },
      { from: 13, to: 15, title: "Cierre", practica: "Decí en una frase qué te llevás.", evalua: "Agradecé y, si quieren, acuerden otra ronda con roles invertidos." },
    ],
    questions: [
      { id: "apertura", label: "¿La apertura enganchó desde la primera frase?", kind: "escala" },
      { id: "sintesis", label: "¿Fue al grano y entró en los 2 minutos?", kind: "escala" },
      { id: "cierre", label: "¿El cierre tuvo un pedido o una conclusión clara?", kind: "escala" },
      ...CLOSING_QUESTIONS,
    ],
  },
  {
    slug: "escucha-activa",
    title: "Escuchar sin interrumpir",
    skill: "Escucha activa",
    summary: "Tu compañero cuenta un problema y vos practicás escuchar, parafrasear y preguntar sin dar consejos.",
    roles: {
      practica: "Escuchás sin interrumpir ni aconsejar, parafraseás y hacés preguntas abiertas.",
      evalua: "Contás un problema (real o inventado) y observás cómo te escucha.",
    },
    script: [
      { from: 0, to: 1, title: "Acuerdo", practica: "Recordá la consigna: nada de consejos, solo escuchar y preguntar.", evalua: "Elegí un problema laboral para contar (real o inventado)." },
      { from: 1, to: 6, title: "El relato", practica: "Escuchá. Usá solo preguntas abiertas (“¿qué pasó después?”, “¿cómo te sentiste?”).", evalua: "Contá el problema con detalles. Anotá si te interrumpe o te aconseja." },
      { from: 6, to: 8, title: "Parafraseo", practica: "Resumí lo que entendiste: los hechos y lo que sentiste que le pasaba.", evalua: "Decile qué parte captó bien y qué se le escapó." },
      { from: 8, to: 12, title: "Feedback", practica: "Escuchá sin justificarte.", evalua: "Contale cómo te sentiste escuchado, con ejemplos, y completá la plantilla." },
      { from: 12, to: 15, title: "Cierre", practica: "Contá qué te costó más (¿las ganas de aconsejar?).", evalua: "Si quieren, acuerden otra ronda con roles invertidos." },
    ],
    questions: [
      { id: "interrupciones", label: "¿Me dejó hablar sin interrumpir ni aconsejar?", kind: "escala" },
      { id: "preguntas", label: "¿Hizo preguntas abiertas que me ayudaron a explicarme?", kind: "escala" },
      { id: "parafraseo", label: "¿Su resumen reflejó bien lo que conté y lo que sentía?", kind: "escala" },
      ...CLOSING_QUESTIONS,
    ],
  },
  {
    slug: "liderar-reunion",
    title: "Liderar una reunión corta",
    skill: "Liderazgo y facilitación",
    summary: "Coordinás una reunión de 7 minutos para tomar una decisión, con un participante que pone objeciones.",
    roles: {
      practica: "Liderás la reunión: objetivo claro, todos opinan y se cierra con una decisión y un responsable.",
      evalua: "Hacés de participante con una objeción fuerte y observás cómo lidera.",
    },
    script: [
      { from: 0, to: 2, title: "Preparación", practica: "Elegí una decisión simple (por ejemplo, cómo organizar las vacaciones del equipo) y dos opciones.", evalua: "Pensá una objeción fuerte a una de las opciones." },
      { from: 2, to: 9, title: "La reunión", practica: "Abrí con el objetivo y el tiempo, escuchá la objeción y cerrá con decisión, responsable y fecha.", evalua: "Participá y presentá tu objeción. Si se va de tema, desviate un poco a propósito." },
      { from: 9, to: 13, title: "Feedback", practica: "Escuchá y preguntá qué hubiera hecho distinto.", evalua: "Contale qué funcionó y qué cambiarías, y completá la plantilla." },
      { from: 13, to: 15, title: "Cierre", practica: "Decí en una frase qué te llevás.", evalua: "Si quieren, acuerden otra ronda con roles invertidos." },
    ],
    questions: [
      { id: "objetivo", label: "¿Dejó claro el objetivo y el tiempo desde el principio?", kind: "escala" },
      { id: "objeciones", label: "¿Manejó bien mi objeción sin descalificarla?", kind: "escala" },
      { id: "decision", label: "¿Cerramos con decisión, responsable y fecha?", kind: "escala" },
      ...CLOSING_QUESTIONS,
    ],
  },
  {
    slug: "dar-feedback",
    title: "Dar feedback difícil",
    skill: "Feedback y asertividad",
    summary: "Le das feedback sobre un problema concreto a tu compañero, que hace de colaborador.",
    roles: {
      practica: "Das feedback con el modelo SCI (situación, conducta, impacto) y acuerdan un cambio.",
      evalua: "Hacés de colaborador: al principio te ponés un poco a la defensiva y observás cómo lo maneja.",
    },
    script: [
      { from: 0, to: 2, title: "Preparación", practica: "Elegí la situación (por ejemplo, llegadas tarde a reuniones) y armá tu mensaje con SCI.", evalua: "Pensá una excusa razonable para defenderte al principio." },
      { from: 2, to: 8, title: "La conversación", practica: "Describí hechos concretos, el impacto, preguntá qué pasa y acuerden algo concreto.", evalua: "Defendete al principio. Si te escucha y no te ataca, aflojá." },
      { from: 8, to: 12, title: "Feedback", practica: "Escuchá sin justificarte.", evalua: "Contale cómo te sentiste del otro lado y completá la plantilla." },
      { from: 12, to: 15, title: "Cierre", practica: "Decí en una frase qué te llevás.", evalua: "Si quieren, acuerden otra ronda con roles invertidos." },
    ],
    questions: [
      { id: "hechos", label: "¿Habló de hechos concretos y no de mi forma de ser?", kind: "escala" },
      { id: "escucha", label: "¿Me preguntó qué me pasaba y me escuchó?", kind: "escala" },
      { id: "acuerdo", label: "¿Terminamos con un acuerdo concreto?", kind: "escala" },
      ...CLOSING_QUESTIONS,
    ],
  },
];

export function getExercise(slug: string): Exercise | undefined {
  return exercises.find((e) => e.slug === slug);
}

export const ROLE_LABEL: Record<PeerRole, string> = { practica: "Practica", evalua: "Evalúa" };

export function otherRole(role: PeerRole): PeerRole {
  return role === "practica" ? "evalua" : "practica";
}

/** Sala de videollamada gratuita, sin cuentas: el nombre sale del id de la sala. */
export function callUrl(roomId: string): string {
  return `https://meet.jit.si/ensayo-${roomId}`;
}

export type RoomRow = {
  id: string;
  exercise_slug: string;
  host_id: string;
  host_name: string;
  host_role: PeerRole;
  guest_id: string | null;
  guest_name: string | null;
  scheduled_at: string | null;
  is_public: boolean;
  status: "open" | "matched" | "done" | "cancelled";
  created_at: string;
};

export type FeedbackAnswers = Record<string, number | string>;
