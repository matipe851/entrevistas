import Link from "next/link";
import { exercises, getExercise, otherRole, ROLE_LABEL, type RoomRow } from "@/lib/peer";
import { requireApproved } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";
import CreateForm from "./create-form";

const ROOM_FIELDS =
  "id, exercise_slug, host_id, host_name, host_role, guest_id, guest_name, scheduled_at, is_public, status, created_at";

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

const STATUS: Record<RoomRow["status"], string> = {
  open: "Esperando compañero",
  matched: "Lista para practicar",
  done: "Terminada",
  cancelled: "Cancelada",
};

function when(room: RoomRow): string {
  return room.scheduled_at ? dateFmt.format(new Date(room.scheduled_at)) : "Cuando se sume alguien";
}

export default async function ParesPage() {
  const user = await requireApproved("/pares");
  const admin = createAdmin();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ data: openData }, { data: mineData }] = await Promise.all([
    admin
      .from("peer_rooms")
      .select(ROOM_FIELDS)
      .eq("status", "open")
      .eq("is_public", true)
      .neq("host_id", user.id)
      .gte("created_at", since)
      .or(`scheduled_at.is.null,scheduled_at.gte."${oneHourAgo}"`)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("peer_rooms")
      .select(ROOM_FIELDS)
      .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const open = (openData ?? []) as RoomRow[];
  const mine = (mineData ?? []) as RoomRow[];
  const suggestedName = (user.email ?? "").split("@")[0].replace(/[._\d]+/g, " ").trim().split(" ")[0] ?? "";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Práctica entre pares</p>
      <h1 className="mt-1 font-display text-3xl">Practicá con otra persona en 15 minutos</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Una persona practica y la otra evalúa. Ensayo arma el guion minuto a minuto, abre la videollamada y al
        final te da una plantilla de feedback guiado. Después pueden invertir los roles.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Ejercicios</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {exercises.map((e) => (
            <li key={e.slug} className="rounded-lg border border-line bg-surface p-5">
              <span className="text-xs uppercase tracking-wider text-muted">{e.skill}</span>
              <h3 className="mt-1 font-display text-xl">{e.title}</h3>
              <p className="mt-2 text-sm">{e.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl">Crear una sala</h2>
          <p className="mt-1 text-sm text-muted">
            Podés publicarla para que se sume cualquiera o compartir el link con alguien que conozcas.
          </p>
          <CreateForm
            exercises={exercises.map((e) => ({ slug: e.slug, title: e.title }))}
            suggestedName={suggestedName ? suggestedName[0].toUpperCase() + suggestedName.slice(1) : ""}
          />
        </div>

        <div>
          <h2 className="font-display text-2xl">Salas abiertas</h2>
          {open.length === 0 ? (
            <p className="mt-2 text-muted">
              No hay salas abiertas ahora. Creá una y compartí el link, o volvé más tarde.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {open.map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                  <p className="font-semibold">{getExercise(r.exercise_slug)?.title ?? r.exercise_slug}</p>
                  <p className="mt-1 text-sm text-muted">
                    {r.host_name} · vos {ROLE_LABEL[otherRole(r.host_role)].toLowerCase()} · {when(r)}
                  </p>
                  <Link
                    href={`/pares/sala/${r.id}`}
                    className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
                  >
                    Ver y unirme
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Tus salas</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-muted">Todavía no participaste de ninguna.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {mine.map((r) => {
              const isHost = r.host_id === user.id;
              const role = isHost ? r.host_role : otherRole(r.host_role);
              const partner = isHost ? r.guest_name : r.host_name;
              return (
                <li key={r.id}>
                  <Link
                    href={`/pares/sala/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-persona"
                  >
                    <span>
                      <span className="font-semibold">{getExercise(r.exercise_slug)?.title ?? r.exercise_slug}</span>
                      <span className="ml-2 text-sm text-muted">
                        {ROLE_LABEL[role]}
                        {partner ? ` · con ${partner}` : ""} · {when(r)}
                      </span>
                    </span>
                    <span className="text-sm">{STATUS[r.status]}</span>
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
