import { dilemmaFor, getDilemma, toPublicDilemma, todayAR } from "@/lib/dilemmas";
import { requireApproved } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";
import VoteForm from "./vote-form";

type Vote = {
  day: string;
  dilemma_id: string;
  choice: string;
  answer: string | null;
  ai_feedback: { score: number; comment: string } | null;
};

/** Días seguidos con respuesta, contando hasta hoy (o hasta ayer si hoy todavía no respondió). */
function streak(days: string[], today: string): number {
  const set = new Set(days);
  const cursor = new Date(`${today}T12:00:00Z`);
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

export default async function DilemaPage() {
  const user = await requireApproved("/dilema");
  const today = todayAR();
  const dilemma = dilemmaFor(today);
  const admin = createAdmin();

  const { data: mine } = await admin
    .from("dilemma_votes")
    .select("day, dilemma_id, choice, answer, ai_feedback")
    .eq("user_id", user.id)
    .order("day", { ascending: false })
    .limit(120);
  const votes = (mine ?? []) as Vote[];
  const todayVote = votes.find((v) => v.day === today) ?? null;
  const days = streak(votes.map((v) => v.day), today);

  let counts: Record<string, number> = {};
  let total = 0;
  if (todayVote) {
    const { data: all } = await admin
      .from("dilemma_votes")
      .select("choice")
      .eq("day", today)
      .eq("dilemma_id", dilemma.id);
    for (const row of (all ?? []) as { choice: string }[]) {
      counts = { ...counts, [row.choice]: (counts[row.choice] ?? 0) + 1 };
      total++;
    }
  }
  const pct = (id: string) => (total ? Math.round(((counts[id] ?? 0) * 100) / total) : 0);
  const best = dilemma.options.find((o) => o.id === dilemma.best);
  const past = votes.filter((v) => v.day !== today).slice(0, 7);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Dilema del día</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl">{dilemma.title}</h1>
        <span className="text-sm text-muted tabular-nums">
          {days > 0 ? `Racha: ${days} ${days === 1 ? "día" : "días"}` : "Empezá tu racha hoy"}
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-wider text-muted">{dilemma.area}</p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <p>{dilemma.situation}</p>
        <p className="mt-3 font-semibold">{dilemma.question}</p>
      </div>

      {!todayVote ? (
        <VoteForm dilemma={toPublicDilemma(dilemma)} />
      ) : (
        <>
          <section className="mt-6" aria-label="Resultados">
            <h2 className="font-display text-xl">Cómo respondió la comunidad</h2>
            <p className="mt-1 text-sm text-muted">
              {total <= 1
                ? "Sos de los primeros en responder hoy. Volvé más tarde para comparar."
                : `${total} personas respondieron hoy.`}
            </p>
            <ul className="mt-4 space-y-3">
              {dilemma.options.map((o) => {
                const isBest = o.id === dilemma.best;
                const isMine = o.id === todayVote.choice;
                return (
                  <li
                    key={o.id}
                    className={`rounded-lg border p-4 ${isBest ? "border-accent" : "border-line"} bg-surface`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p>
                        <b className="uppercase">{o.id})</b> {o.text}
                      </p>
                      <b className="tabular-nums">{pct(o.id)}%</b>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-persona">
                      <div className="h-full bg-accent" style={{ width: `${pct(o.id)}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {isBest && <b className="text-accent">Mejor enfoque. </b>}
                      {isMine && <b className="text-foreground">{todayVote.answer ? "Lo más parecido a tu respuesta. " : "Tu elección. "}</b>}
                      {o.why}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          {todayVote.answer && (
            <section className="mt-6 rounded-lg border border-line bg-surface p-5">
              <h2 className="font-display text-xl">Tu respuesta</h2>
              <p className="mt-2 whitespace-pre-line text-sm">{todayVote.answer}</p>
              {todayVote.ai_feedback && (
                <p className="mt-3">
                  <b className="tabular-nums">{todayVote.ai_feedback.score}/10.</b> {todayVote.ai_feedback.comment}
                </p>
              )}
            </section>
          )}

          <section className="mt-6 rounded-lg border border-line bg-persona p-5">
            <h2 className="font-display text-xl">La teoría detrás</h2>
            <p className="mt-2 font-semibold">{dilemma.principle}</p>
            <p className="mt-2">{dilemma.explanation}</p>
            {best && (
              <p className="mt-3 text-sm text-muted">
                Mejor enfoque: <span className="uppercase">{best.id})</span> {best.text}
              </p>
            )}
          </section>

          <p className="mt-6 text-sm text-muted">Mañana hay un dilema nuevo. Volvé para sostener tu racha.</p>
        </>
      )}

      {past.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl">Tus últimos dilemas</h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {past.map((v) => {
              const d = getDilemma(v.dilemma_id);
              const hit = d && v.choice === d.best;
              return (
                <li key={v.day} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{d?.title ?? v.dilemma_id}</span>
                    <span className="ml-2 text-muted tabular-nums">{v.day.split("-").reverse().join("/")}</span>
                  </span>
                  <span className={hit ? "text-accent" : "text-muted"}>{hit ? "Mejor enfoque" : "Otro enfoque"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
