"use client";

import { track } from "@vercel/analytics";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  callUrl,
  otherRole,
  ROLE_LABEL,
  type Exercise,
  type FeedbackAnswers,
  type PeerRole,
  type RoomRow,
} from "@/lib/peer";

type Props = {
  room: { id: string; status: RoomRow["status"]; scheduledAt: string | null; isPublic: boolean };
  exercise: Exercise;
  viewer: "host" | "guest" | "outsider";
  myRole: PeerRole;
  partnerName: string | null;
  feedback: FeedbackAnswers | null;
  suggestedName: string;
};

const TOTAL_SECONDS = 15 * 60;
const field = "mt-1 w-full rounded-md border border-line bg-background px-3 py-2 focus:outline-2 focus:outline-accent";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch("/api/pares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
  return { ok: !!res?.ok, id: data?.id, error: data?.error ?? (res?.ok ? undefined : "Algo salió mal. Probá de nuevo.") };
}

export default function Room({ room, exercise, viewer, myRole, partnerName, feedback, suggestedName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [answers, setAnswers] = useState<FeedbackAnswers>({});

  const participant = viewer !== "outsider";
  const waitingPartner = viewer === "host" && room.status === "open";
  const waitingFeedback = participant && room.status !== "open" && !feedback;

  // Mientras se espera a la otra persona (que se una o que mande el feedback), refrescamos cada 15 segundos.
  useEffect(() => {
    if (!waitingPartner && !(waitingFeedback && myRole === "practica")) return;
    const t = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(t);
  }, [waitingPartner, waitingFeedback, myRole, router]);

  useEffect(() => {
    if (startedAt === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : Math.min(TOTAL_SECONDS, (now - startedAt) / 1000);
  const minute = elapsed / 60;
  const current = startedAt === null ? -1 : exercise.script.findIndex((s) => minute >= s.from && minute < s.to);

  async function run(payload: Record<string, unknown>, after: (id?: string) => void) {
    setBusy(true);
    setError(null);
    const result = await post({ ...payload, roomId: room.id });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Algo salió mal.");
    after(result.id);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No pudimos copiar el link. Copialo desde la barra del navegador.");
    }
  }

  const scaleDone = exercise.questions.every((q) =>
    q.kind === "escala" ? typeof answers[q.id] === "number" : String(answers[q.id] ?? "").trim().length >= 3,
  );

  return (
    <div className="mt-4">
      <span className="text-xs uppercase tracking-wider text-muted">{exercise.skill}</span>
      <h1 className="mt-1 font-display text-3xl">{exercise.title}</h1>
      <p className="mt-2 text-muted">{exercise.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-accent px-3 py-1 font-semibold text-accent-ink">
          {viewer === "outsider" ? "Te tocaría: " : "Tu rol: "}
          {ROLE_LABEL[myRole]}
        </span>
        <span className="rounded-full border border-line px-3 py-1">
          {partnerName ? `Con ${partnerName} (${ROLE_LABEL[otherRole(myRole)].toLowerCase()})` : "Esperando compañero"}
        </span>
        {room.scheduledAt && (
          <span className="rounded-full border border-line px-3 py-1">
            {new Intl.DateTimeFormat("es-AR", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(room.scheduledAt))}
          </span>
        )}
      </div>
      <p className="mt-3">{exercise.roles[myRole]}</p>

      {viewer === "outsider" && (
        <section className="mt-6 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-xl">Unite a esta sala</h2>
          <label className="mt-3 block text-sm font-semibold">
            Tu nombre (como te va a ver la otra persona)
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={field} />
          </label>
          <button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              run({ action: "join", name }, () => {
                track("pares_union", { ejercicio: exercise.slug });
                router.refresh();
              })
            }
            className="mt-4 rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
          >
            {busy ? "Uniéndote…" : `Unirme para ${myRole === "practica" ? "practicar" : "evaluar"}`}
          </button>
        </section>
      )}

      {waitingPartner && (
        <section className="mt-6 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-xl">Esperando a tu compañero</h2>
          <p className="mt-2 text-sm text-muted">
            {room.isPublic
              ? "Tu sala aparece en “Salas abiertas”. También podés mandarle el link a alguien que conozcas."
              : "Mandale este link a la persona con la que vas a practicar."}{" "}
            Esta página se actualiza sola cuando alguien se une.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={copyLink} className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink">
              {copied ? "¡Link copiado!" : "Copiar link de la sala"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ action: "cancel" }, () => router.push("/pares"))}
              className="rounded-md border border-line px-4 py-2 font-semibold disabled:opacity-40"
            >
              Cancelar sala
            </button>
          </div>
        </section>
      )}

      {participant && room.status !== "open" && (
        <>
          <section className="mt-6 rounded-lg border border-accent bg-surface p-5">
            <h2 className="font-display text-xl">1. Entren a la videollamada</h2>
            <p className="mt-1 text-sm text-muted">Se abre Jitsi Meet en otra pestaña: es gratis y no necesita cuenta.</p>
            <a
              href={callUrl(room.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:opacity-90"
            >
              Abrir videollamada
            </a>
          </section>

          <section className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-xl">2. Sigan el guion</h2>
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl tabular-nums">
                  {startedAt === null ? "15:00" : fmt(TOTAL_SECONDS - elapsed)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNow(Date.now());
                    setStartedAt(startedAt === null ? Date.now() : null);
                  }}
                  className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold"
                >
                  {startedAt === null ? "Empezar cronómetro" : "Reiniciar"}
                </button>
              </div>
            </div>
            {elapsed >= TOTAL_SECONDS && <p className="mt-2 font-semibold text-accent">¡Tiempo! Cierren la ronda.</p>}
            <ol className="mt-4 space-y-3">
              {exercise.script.map((step, i) => (
                <li
                  key={step.title}
                  className={`rounded-lg border p-4 ${i === current ? "border-accent bg-surface" : "border-line bg-surface"} ${
                    current > i ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold">{step.title}</h3>
                    <span className="text-xs text-muted tabular-nums">
                      min {step.from}–{step.to}
                    </span>
                  </div>
                  <p className="mt-1">{step[myRole]}</p>
                  <p className="mt-1 text-sm text-muted">
                    {ROLE_LABEL[otherRole(myRole)]}: {step[otherRole(myRole)]}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl">3. Feedback guiado</h2>
            {feedback ? (
              <FeedbackView exercise={exercise} answers={feedback} mine={myRole === "evalua"} />
            ) : myRole === "evalua" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run({ action: "feedback", answers }, () => {
                    track("pares_feedback", { ejercicio: exercise.slug });
                    router.refresh();
                  });
                }}
                className="mt-3 space-y-5 rounded-lg border border-line bg-surface p-5"
              >
                <p className="text-sm text-muted">Completalo al final, con ejemplos concretos. Tu compañero lo ve en Ensayo.</p>
                {exercise.questions.map((q) =>
                  q.kind === "escala" ? (
                    <fieldset key={q.id}>
                      <legend className="text-sm font-semibold">{q.label}</legend>
                      <div className="mt-2 flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={answers[q.id] === n}
                            onClick={() => setAnswers({ ...answers, [q.id]: n })}
                            className={`h-10 w-10 rounded-md border font-semibold tabular-nums ${
                              answers[q.id] === n ? "border-accent bg-accent text-accent-ink" : "border-line"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted">1 = nada, 5 = totalmente</p>
                    </fieldset>
                  ) : (
                    <label key={q.id} className="block text-sm font-semibold">
                      {q.label}
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={String(answers[q.id] ?? "")}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        className={field}
                      />
                    </label>
                  ),
                )}
                <button
                  type="submit"
                  disabled={busy || !scaleDone}
                  className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
                >
                  {busy ? "Enviando…" : "Enviar feedback"}
                </button>
              </form>
            ) : (
              <p className="mt-2 text-muted">
                Cuando {partnerName ?? "tu compañero"} complete la plantilla, la vas a ver acá. La página se actualiza sola.
              </p>
            )}
          </section>

          {feedback && (
            <section className="mt-8 rounded-lg border border-line bg-persona p-5">
              <h2 className="font-display text-xl">¿Otra ronda?</h2>
              <p className="mt-1 text-sm">Inviertan los roles: ahora {myRole === "practica" ? "evaluás vos" : "practicás vos"}.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => run({ action: "rematch" }, (id) => id && router.push(`/pares/sala/${id}`))}
                className="mt-3 rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
              >
                Nueva ronda con roles invertidos
              </button>
            </section>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function FeedbackView({ exercise, answers, mine }: { exercise: Exercise; answers: FeedbackAnswers; mine: boolean }) {
  return (
    <div className="mt-3 rounded-lg border border-accent bg-surface p-5">
      <p className="text-sm text-muted">{mine ? "Este es el feedback que enviaste." : "Esto es lo que te devolvió tu compañero."}</p>
      <dl className="mt-3 space-y-3">
        {exercise.questions.map((q) => (
          <div key={q.id}>
            <dt className="text-sm font-semibold">{q.label}</dt>
            <dd className="mt-1">
              {q.kind === "escala" ? (
                <span className="tabular-nums">
                  {"●".repeat(Number(answers[q.id]) || 0)}
                  <span className="opacity-30">{"●".repeat(5 - (Number(answers[q.id]) || 0))}</span> {answers[q.id]}/5
                </span>
              ) : (
                <span className="whitespace-pre-line">{String(answers[q.id] ?? "")}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
