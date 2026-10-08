import Link from "next/link";
import { notFound } from "next/navigation";
import { getChallenge, type SpeechResult } from "@/lib/oratoria";
import { requireApproved } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

type Attempt = {
  id: string;
  challenge_slug: string;
  mode: "audio" | "texto";
  duration_seconds: number | null;
  transcript: string;
  result: SpeechResult;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default async function AttemptPage(props: PageProps<"/oratoria/intento/[id]">) {
  const { id } = await props.params;
  const user = await requireApproved(`/oratoria/intento/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await createAdmin()
    .from("speech_attempts")
    .select("id, challenge_slug, mode, duration_seconds, transcript, result")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const attempt = data as Attempt | null;
  const challenge = attempt && getChallenge(attempt.challenge_slug);
  if (!attempt || !challenge) notFound();

  const r = attempt.result;
  const scores = [
    { label: "Síntesis", value: r.scores.synthesis },
    { label: "Estructura", value: r.scores.structure },
    { label: "Claridad", value: r.scores.clarity },
    { label: "Persuasión", value: r.scores.persuasion },
  ];
  const totalFillers = r.fillers.reduce((n, f) => n + f.count, 0);
  const seconds = attempt.duration_seconds;
  const timeNote =
    seconds == null
      ? null
      : seconds > challenge.seconds * 1.15
      ? "Te pasaste del tiempo: recortá ideas secundarias."
      : seconds < challenge.seconds * 0.5
      ? "Quedaste bastante corto: podés sumar un ejemplo o un dato."
      : "Buen manejo del tiempo.";
  const paceNote =
    r.wordsPerMinute == null
      ? null
      : r.wordsPerMinute > 170
      ? "Hablaste rápido: hacé pausas después de cada idea."
      : r.wordsPerMinute < 110
      ? "Hablaste lento: probá con un ritmo un poco más ágil."
      : "Buen ritmo (lo ideal suele estar entre 130 y 160 palabras por minuto).";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/oratoria" className="text-sm text-muted hover:text-foreground">
        ← Oratoria
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-accent">Análisis</p>
      <h1 className="mt-1 font-display text-3xl">{challenge.title}</h1>
      <p className="mt-3 text-lg">{r.summary}</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Puntajes">
        {scores.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between text-sm">
              <span>{s.label}</span>
              <b className="tabular-nums">{s.value}/10</b>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-persona">
              <div className="h-full bg-accent" style={{ width: `${s.value * 10}%` }} />
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted">
            {attempt.mode === "audio" ? "Duración" : "Duración estimada"}
          </p>
          <p className="mt-1 font-display text-2xl tabular-nums">{seconds != null ? fmt(seconds) : "—"}</p>
          <p className="text-xs text-muted tabular-nums">Objetivo {fmt(challenge.seconds)}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Ritmo</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{r.wordsPerMinute ?? "—"}</p>
          <p className="text-xs text-muted">palabras por minuto</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Muletillas</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{totalFillers}</p>
          <p className="text-xs text-muted">en total</p>
        </div>
      </section>
      {(timeNote || paceNote) && (
        <p className="mt-3 text-sm text-muted">{[timeNote, paceNote].filter(Boolean).join(" ")}</p>
      )}

      {r.fillers.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">Tus muletillas</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {r.fillers.map((f) => (
              <li key={f.word} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
                “{f.word}” <b className="tabular-nums">×{f.count}</b>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">
            Truco: cuando sientas que viene una muletilla, reemplazala por una pausa de un segundo. El silencio
            transmite seguridad.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl">Estructura</h2>
        <dl className="mt-3 space-y-3">
          {[
            ["Apertura", r.structure.opening],
            ["Desarrollo", r.structure.body],
            ["Cierre", r.structure.closing],
          ].map(([label, text]) => (
            <div key={label} className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-sm font-semibold">{label}</dt>
              <dd className="mt-1">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {r.tips.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">Para tu próximo intento</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            {r.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-accent bg-surface p-5">
        <h2 className="font-display text-xl">Una versión mejorada</h2>
        <p className="mt-1 text-sm text-muted">Con tus mismas ideas, ordenadas para el tiempo y el público.</p>
        <p className="mt-3 whitespace-pre-line">{r.improved}</p>
      </section>

      <details className="mt-8 rounded-lg border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">
          {attempt.mode === "audio" ? "Transcripción de tu audio" : "Tu texto"}
        </summary>
        <p className="mt-3 whitespace-pre-line text-sm">{attempt.transcript}</p>
      </details>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={`/oratoria/${challenge.slug}`}
          className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:opacity-90"
        >
          Intentar de nuevo
        </Link>
        <Link href="/oratoria" className="rounded-md border border-line px-5 py-2.5 font-semibold">
          Otro desafío
        </Link>
      </div>
    </main>
  );
}
