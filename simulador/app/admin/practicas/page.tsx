import Link from "next/link";
import { average, dateFmt, feedbackOf, listProfiles, listSessions } from "@/lib/admin-data";
import { getScenario } from "@/lib/scenarios";

export default async function AdminPracticesPage() {
  const [profiles, sessions] = await Promise.all([listProfiles(), listSessions(200)]);
  const emails = new Map(profiles.map((p) => [p.id, p.email]));

  return (
    <>
      <h1 className="font-display text-3xl">Prácticas de todos</h1>
      <p className="mt-2 text-muted">Las últimas {sessions.length}. Tocá una para leer la conversación y el diagnóstico.</p>

      {sessions.length === 0 ? (
        <p className="mt-6 text-muted">Todavía no hay prácticas.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {sessions.map((s) => {
            const f = feedbackOf(s);
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/practicas/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-persona"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{getScenario(s.scenario_slug)?.title ?? s.scenario_slug}</span>
                    <span className="block truncate text-sm text-muted">
                      {emails.get(s.user_id) ?? "usuario borrado"} · {dateFmt.format(new Date(s.created_at))}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {f ? `Promedio ${average(f).toFixed(1)}/10` : s.status === "active" ? "En curso" : "Sin diagnóstico"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
