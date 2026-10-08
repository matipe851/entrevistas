import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { scoreLabels, type FeedbackRow } from "@/lib/feedback";
import { getScenario } from "@/lib/scenarios";
import { getOwnSession } from "@/lib/sessions";
import { requireApproved } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export default async function ResultPage(props: PageProps<"/sesion/[id]/resultado">) {
  const { id } = await props.params;
  const user = await requireApproved(`/sesion/${id}/resultado`);
  const session = await getOwnSession(id, user.id);
  const scenario = session && getScenario(session.scenario_slug);
  if (!session || !scenario) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("feedback").select("*").eq("session_id", id).maybeSingle();
  const feedback = data as FeedbackRow | null;
  if (!feedback) redirect(`/sesion/${id}`);

  const labels = scoreLabels(scenario);
  const scores = [
    { label: labels[0], value: feedback.score_tone },
    { label: labels[1], value: feedback.score_assertive },
    { label: labels[2], value: feedback.score_empathy },
    { label: labels[3], value: feedback.score_clarity },
  ];
  const deal = feedback.deal ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/practicar" className="text-sm text-muted hover:text-foreground">
        ← Mis prácticas
      </Link>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-accent">Diagnóstico</p>
      <h1 className="mt-1 font-display text-3xl">{scenario.title}</h1>
      <p className="mt-3 text-lg">{feedback.summary}</p>

      {deal && (
        <section
          className={`mt-6 rounded-lg border p-4 ${deal.withinGoal ? "border-accent" : "border-line"} bg-surface`}
          aria-label="Resultado de la negociación"
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            {deal.withinGoal ? "Acuerdo dentro de tu objetivo" : deal.reached ? "Acuerdo fuera de tu objetivo" : "Sin acuerdo"}
          </p>
          <p className="mt-1">{deal.detail}</p>
        </section>
      )}

      {scenario.reveal && (
        <section className="mt-4 rounded-lg border border-line bg-persona p-4">
          <p className="text-sm font-semibold">Lo que no sabías de la otra parte</p>
          <p className="mt-1 text-sm">{scenario.reveal}</p>
        </section>
      )}

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

      {feedback.strengths.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl">Lo que hiciste bien</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {feedback.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {feedback.rewrites.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl">Cómo podrías haberlo dicho</h2>
          <div className="mt-3 divide-y divide-line">
            {feedback.rewrites.map((r, i) => (
              <div key={i} className="py-3">
                <p className="text-sm text-muted line-through decoration-line">“{r.original}”</p>
                <p className="mt-1 font-semibold">“{r.mejor}”</p>
                <p className="mt-1 text-sm text-muted">{r.porque}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={`/practicar/${scenario.slug}?repetir=1`}
          className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:opacity-90"
        >
          Repetir esta situación
        </Link>
        <Link href="/practicar" className="rounded-md border border-line px-5 py-2.5 font-semibold">
          Probar otra
        </Link>
      </div>
    </main>
  );
}
