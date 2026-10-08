import Link from "next/link";
import { startOfTodayAR } from "@/lib/limits";
import { challenges, DAILY_SPEECHES, getChallenge, type SpeechResult } from "@/lib/oratoria";
import { requireApproved } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

type AttemptRow = { id: string; challenge_slug: string; mode: string; created_at: string; result: SpeechResult };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

export default async function OratoriaPage() {
  const user = await requireApproved("/oratoria");
  const admin = createAdmin();
  const { data } = await admin
    .from("speech_attempts")
    .select("id, challenge_slug, mode, created_at, result")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(15);
  const attempts = (data ?? []) as AttemptRow[];
  const today = Date.parse(startOfTodayAR());
  const usedToday = attempts.filter((a) => Date.parse(a.created_at) >= today).length;
  const remaining = Math.max(0, DAILY_SPEECHES - usedToday);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Oratoria</p>
      <h1 className="mt-1 font-display text-3xl">Entrenador de presentación</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Elegí un desafío, grabate (o escribí lo que dirías) y recibí un análisis de tu síntesis, estructura,
        muletillas y poder de persuasión, con una versión mejorada de tu intervención.
      </p>
      <p className="mt-2 text-sm text-muted">
        {user.isAdmin
          ? "Sos administrador: tus intentos son ilimitados."
          : remaining > 0
          ? `Te quedan ${remaining} de ${DAILY_SPEECHES} intentos hoy.`
          : `Ya usaste tus ${DAILY_SPEECHES} intentos de hoy. Mañana tenés más.`}
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {challenges.map((c) => (
          <li key={c.slug} className="flex flex-col rounded-lg border border-line bg-surface p-5">
            <span className="text-xs uppercase tracking-wider text-muted tabular-nums">
              {c.seconds < 120 ? `${c.seconds} segundos` : `${c.seconds / 60} minutos`}
            </span>
            <h2 className="mt-1 font-display text-xl">{c.title}</h2>
            <p className="mt-2 flex-1 text-sm">{c.prompt}</p>
            <Link
              href={`/oratoria/${c.slug}`}
              className="mt-4 self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
            >
              Aceptar el desafío
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Tus intentos</h2>
        {attempts.length === 0 ? (
          <p className="mt-2 text-muted">Todavía no hiciste ninguno.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {attempts.map((a) => {
              const s = a.result.scores;
              const avg = ((s.synthesis + s.structure + s.clarity + s.persuasion) / 4).toFixed(1);
              return (
                <li key={a.id}>
                  <Link
                    href={`/oratoria/intento/${a.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-persona"
                  >
                    <span>
                      <span className="font-semibold">{getChallenge(a.challenge_slug)?.title ?? a.challenge_slug}</span>
                      <span className="ml-2 text-sm text-muted">
                        {dateFmt.format(new Date(a.created_at))} · {a.mode === "audio" ? "Audio" : "Texto"}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums">Promedio {avg}/10</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
