import { average, feedbackOf, listProfiles, listSessions } from "@/lib/admin-data";
import { getScenario } from "@/lib/scenarios";

const DAY = 24 * 60 * 60 * 1000;

function pct(part: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((100 * part) / total)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function AdminMetricsPage() {
  const [profiles, sessions] = await Promise.all([listProfiles(), listSessions()]);
  const now = Date.now();

  const last30 = sessions.filter((s) => now - new Date(s.created_at).getTime() <= 30 * DAY);
  const withFeedback30 = last30.filter((s) => feedbackOf(s)).length;

  // Repiten: otra práctica dentro de los 7 días de la primera.
  const byUser = new Map<string, number[]>();
  for (const s of sessions) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(new Date(s.created_at).getTime());
    byUser.set(s.user_id, list);
  }
  let repeaters = 0;
  for (const times of byUser.values()) {
    const first = Math.min(...times);
    if (times.some((t) => t > first && t <= first + 7 * DAY)) repeaters++;
  }

  // Por situación: cantidad y puntaje promedio.
  const byScenario = new Map<string, { count: number; scores: number[] }>();
  for (const s of sessions) {
    const row = byScenario.get(s.scenario_slug) ?? { count: 0, scores: [] };
    row.count++;
    const f = feedbackOf(s);
    if (f) row.scores.push(average(f));
    byScenario.set(s.scenario_slug, row);
  }
  const scenarioRows = [...byScenario.entries()].sort((a, b) => b[1].count - a[1].count);

  const count = (status: string) => profiles.filter((p) => p.status === status).length;

  return (
    <>
      <h1 className="font-display text-3xl">Métricas</h1>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Cuentas" value={profiles.length} hint={`${count("approved")} aprobadas · ${count("pending")} pendientes · ${count("denied")} rechazadas`} />
        <Stat label="Prácticas (30 días)" value={last30.length} hint={`${sessions.length} en total`} />
        <Stat label="Llegan al diagnóstico" value={pct(withFeedback30, last30.length)} hint="Últimos 30 días · meta: más del 60%" />
        <Stat label="Usuarios que practicaron" value={byUser.size} />
        <Stat label="Repiten en la semana" value={pct(repeaters, byUser.size)} hint={`${repeaters} de ${byUser.size} · meta: más del 25%`} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Por situación</h2>
        {scenarioRows.length === 0 ? (
          <p className="mt-2 text-muted">Todavía no hay prácticas.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 font-semibold">Situación</th>
                <th className="py-2 text-right font-semibold">Prácticas</th>
                <th className="py-2 text-right font-semibold">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {scenarioRows.map(([slug, row]) => (
                <tr key={slug} className="border-b border-line">
                  <td className="py-2">{getScenario(slug)?.title ?? slug}</td>
                  <td className="py-2 text-right tabular-nums">{row.count}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.scores.length
                      ? `${(row.scores.reduce((a, b) => a + b, 0) / row.scores.length).toFixed(1)}/10`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
