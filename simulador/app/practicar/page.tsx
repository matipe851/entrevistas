import Link from "next/link";
import Difficulty from "@/components/difficulty";
import { DAILY_SESSIONS } from "@/lib/limits";
import { getScenario, scenarios } from "@/lib/scenarios";
import { remainingToday } from "@/lib/sessions";
import { requireApproved } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

type Scores = { score_tone: number; score_assertive: number; score_empathy: number; score_clarity: number };

type HistoryRow = {
  id: string;
  scenario_slug: string;
  status: "active" | "finished";
  created_at: string;
  feedback: Scores | Scores[] | null;
};

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

export default async function PracticarPage() {
  const user = await requireApproved("/practicar");
  const supabase = await createClient();
  const [{ data }, remaining] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, scenario_slug, status, created_at, feedback(score_tone, score_assertive, score_empathy, score_clarity)")
      .order("created_at", { ascending: false })
      .limit(20),
    user.isAdmin ? Infinity : remainingToday(user.id),
  ]);
  const history = (data ?? []) as unknown as HistoryRow[];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl">Elegí qué practicar</h1>
      <p className="mt-2 text-muted">
        {user.isAdmin
          ? "Sos administrador: tus prácticas son ilimitadas."
          : remaining > 0
          ? `Te quedan ${remaining} de ${DAILY_SESSIONS} prácticas hoy.`
          : `Ya usaste tus ${DAILY_SESSIONS} prácticas de hoy. Mañana tenés más.`}
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {scenarios.map((s) => (
          <li key={s.slug} className="flex flex-col rounded-lg border border-line bg-surface p-5">
            <Difficulty level={s.difficulty} />
            <h2 className="mt-2 font-display text-xl">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">Con {s.persona}</p>
            <p className="mt-3 flex-1 text-sm">
              <strong className="font-semibold">Tu objetivo:</strong> {s.userGoal}
            </p>
            <Link
              href={`/practicar/${s.slug}`}
              className="mt-4 self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
            >
              Ver situación
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Tus prácticas</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-muted">Todavía no hiciste ninguna. Elegí una situación para empezar.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {history.map((h) => {
              // PostgREST devuelve el diagnóstico como objeto (relación 1 a 1), pero aceptamos también una lista.
              const f = Array.isArray(h.feedback) ? (h.feedback[0] ?? null) : h.feedback;
              const avg = f
                ? ((f.score_tone + f.score_assertive + f.score_empathy + f.score_clarity) / 4).toFixed(1)
                : null;
              const href = f ? `/sesion/${h.id}/resultado` : `/sesion/${h.id}`;
              return (
                <li key={h.id}>
                  <Link href={href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-persona">
                    <span>
                      <span className="font-semibold">{getScenario(h.scenario_slug)?.title ?? h.scenario_slug}</span>
                      <span className="ml-2 text-sm text-muted">{dateFmt.format(new Date(h.created_at))}</span>
                    </span>
                    <span className="text-sm tabular-nums">
                      {avg ? `Promedio ${avg}/10` : h.status === "active" ? "En curso" : "Sin diagnóstico"}
                    </span>
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
