import Link from "next/link";
import { notFound } from "next/navigation";
import { getExercise, otherRole, type FeedbackAnswers, type RoomRow } from "@/lib/peer";
import { requireApproved } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";
import Room from "./room";

const ROOM_FIELDS =
  "id, exercise_slug, host_id, host_name, host_role, guest_id, guest_name, scheduled_at, is_public, status, created_at";

export default async function RoomPage(props: PageProps<"/pares/sala/[id]">) {
  const { id } = await props.params;
  const user = await requireApproved(`/pares/sala/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdmin();
  const { data } = await admin.from("peer_rooms").select(ROOM_FIELDS).eq("id", id).maybeSingle();
  const room = data as RoomRow | null;
  const exercise = room && getExercise(room.exercise_slug);
  if (!room || !exercise) notFound();

  const viewer = room.host_id === user.id ? "host" : room.guest_id === user.id ? "guest" : "outsider";
  const unavailable =
    room.status === "cancelled" || (viewer === "outsider" && (room.status !== "open" || room.guest_id !== null));

  if (unavailable) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl">Esta sala no está disponible</h1>
        <p className="mt-2 text-muted">
          {room.status === "cancelled" ? "Quien la creó la canceló." : "Ya se sumó otra persona."} Podés crear una
          sala nueva o unirte a otra.
        </p>
        <Link href="/pares" className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink">
          Ir a práctica entre pares
        </Link>
      </main>
    );
  }

  let feedback: FeedbackAnswers | null = null;
  if (viewer !== "outsider") {
    const { data: fb } = await admin.from("peer_feedback").select("answers").eq("room_id", room.id).limit(1);
    feedback = ((fb ?? [])[0]?.answers as FeedbackAnswers | undefined) ?? null;
  }

  const myRole = viewer === "host" ? room.host_role : otherRole(room.host_role);
  const partnerName = viewer === "host" ? room.guest_name : room.host_name;
  const suggestedName = (user.email ?? "").split("@")[0].replace(/[._\d]+/g, " ").trim().split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/pares" className="text-sm text-muted hover:text-foreground">
        ← Práctica entre pares
      </Link>
      <Room
        room={{
          id: room.id,
          status: room.status,
          scheduledAt: room.scheduled_at,
          isPublic: room.is_public,
        }}
        exercise={exercise}
        viewer={viewer}
        myRole={myRole}
        partnerName={partnerName}
        feedback={feedback}
        suggestedName={suggestedName ? suggestedName[0].toUpperCase() + suggestedName.slice(1) : ""}
      />
    </main>
  );
}
