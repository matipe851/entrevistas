import { isAdminEmail } from "@/lib/admin";
import { dateFmt, listProfiles, listSessions, type ProfileRow } from "@/lib/admin-data";

const STATUS_LABEL: Record<ProfileRow["status"], string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  denied: "Rechazado",
};

const ORDER: Record<ProfileRow["status"], number> = { pending: 0, approved: 1, denied: 2 };

function ActionButton({ id, action, label, primary }: { id: string; action: string; label: string; primary?: boolean }) {
  return (
    <form action="/api/admin/users" method="post">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={
          primary
            ? "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90"
            : "rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-persona"
        }
      >
        {label}
      </button>
    </form>
  );
}

export default async function AdminUsersPage(props: PageProps<"/admin">) {
  const params = await props.searchParams;
  const [profiles, sessions] = await Promise.all([listProfiles(), listSessions()]);
  const practiceCount = new Map<string, number>();
  for (const s of sessions) practiceCount.set(s.user_id, (practiceCount.get(s.user_id) ?? 0) + 1);

  const sorted = [...profiles].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.created_at.localeCompare(a.created_at),
  );
  const pending = profiles.filter((p) => p.status === "pending").length;

  return (
    <>
      <h1 className="font-display text-3xl">Usuarios</h1>
      <p className="mt-2 text-muted">
        {profiles.length} cuentas · {pending === 0 ? "ninguna pendiente" : `${pending} esperando tu aprobación`}
      </p>
      {params.error === "1" && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          No se pudo guardar el cambio. Probá de nuevo.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="mt-6 text-muted">Todavía no se registró nadie.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {sorted.map((p) => {
            const admin = isAdminEmail(p.email);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.email || "(sin email)"}</p>
                  <p className="text-sm text-muted">
                    {admin ? "Administrador" : STATUS_LABEL[p.status]} · se registró el{" "}
                    {dateFmt.format(new Date(p.created_at))} · {practiceCount.get(p.id) ?? 0} prácticas
                  </p>
                </div>
                {!admin && (
                  <div className="flex gap-2">
                    {p.status !== "approved" && <ActionButton id={p.id} action="approve" label="Aceptar" primary />}
                    {p.status !== "denied" && (
                      <ActionButton id={p.id} action="deny" label={p.status === "approved" ? "Quitar acceso" : "Denegar"} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
