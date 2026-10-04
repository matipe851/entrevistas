import Link from "next/link";
import { notFound } from "next/navigation";
import { dateFmt } from "@/lib/admin-data";
import type { FeedbackRow } from "@/lib/feedback";
import { getScenario } from "@/lib/scenarios";
import { getTurns, type SessionRow } from "@/lib/sessions";
import { createAdmin } from "@/lib/supabase/server";

export default async function AdminPracticePage(props: PageProps<"/admin/practicas/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdmin();
  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, scenario_slug, status, created_at")
    .eq("id", id)
    .maybeSingle<SessionRow>();
  if (!session) notFound();

  const [turns, { data: feedback }, { data: profile }] = await Promise.all([
    getTurns(id),
    admin.from("feedback").select("*").eq("session_id", id).maybeSingle<FeedbackRow>(),
    admin.from("profiles").select("email").eq("id", session.user_id).maybeSingle<{ email: string }>(),
  ]);
  const scenario = getScenario(session.scenario_slug);
  const persona = scenario?.persona ?? "Personaje";

  return (
    <>
      <Link href="/admin/practicas" className="text-sm text-muted hover:text-foreground">
        ← Todas las prácticas
      </Link>
      <h1 className="mt-3 font-display text-3xl">{scenario?.title ?? session.scenario_slug}</h1>
      <p className="mt-1 text-sm text-muted">
        {profile?.email ?? "usuario borrado"} · {dateFmt.format(new Date(session.created_at))} ·{" "}
        {session.status === "finished" ? "terminada" : "en curso"}
      </p>

      <section className="mt-6 space-y-3" aria-label="Conversación">
        {scenario && (
          <div className="rounded-lg bg-persona p-3">
            <p className="text-xs font-semibold text-muted">{persona}</p>
            <p className="mt-1 whitespace-pre-wrap">{scenario.opening}</p>
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={t.role === "user" ? "ml-8 rounded-lg border border-line bg-surface p-3" : "mr-8 rounded-lg bg-persona p-3"}
          >
            <p className="text-xs font-semibold text-muted">{t.role === "user" ? "Usuario" : persona}</p>
            <p className="mt-1 whitespace-pre-wrap">{t.content}</p>
          </div>
        ))}
        {turns.length === 0 && <p className="text-muted">Todavía no escribió nada.</p>}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Diagnóstico</h2>
        {!feedback ? (
          <p className="mt-2 text-muted">No pidió el diagnóstico.</p>
        ) : (
          <div className="mt-3 space-y-4">
            <p>{feedback.summary}</p>
            <p className="text-sm tabular-nums">
              Tono {feedback.score_tone} · Asertividad {feedback.score_assertive} · Empatía {feedback.score_empathy} ·
              Claridad {feedback.score_clarity}
            </p>
            {feedback.strengths.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {feedback.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            {feedback.rewrites.map((r, i) => (
              <div key={i} className="border-t border-line pt-3">
                <p className="text-sm text-muted line-through decoration-line">“{r.original}”</p>
                <p className="mt-1 font-semibold">“{r.mejor}”</p>
                <p className="mt-1 text-sm text-muted">{r.porque}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
