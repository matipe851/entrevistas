import { getExercise, otherRole, type FeedbackAnswers, type PeerRole, type RoomRow } from "@/lib/peer";
import { approvedOrError } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

const MAX_NAME = 40;
const MAX_TEXT_ANSWER = 1000;
const ROOM_FIELDS =
  "id, exercise_slug, host_id, host_name, host_role, guest_id, guest_name, scheduled_at, is_public, status, created_at";

function cleanName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name.length >= 2 && name.length <= MAX_NAME ? name : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Una sola ruta para las acciones de las salas: crear, unirse, dar feedback, cancelar y otra ronda. */
export async function POST(request: Request) {
  const gate = await approvedOrError();
  if ("response" in gate) return gate.response;
  const user = gate.access;
  const admin = createAdmin();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return bad("Pedido inválido.");

  if (body.action === "create") {
    const exercise = typeof body.exercise === "string" ? getExercise(body.exercise) : undefined;
    const role = body.role === "evalua" ? "evalua" : body.role === "practica" ? "practica" : null;
    const name = cleanName(body.name);
    if (!exercise || !role) return bad("Elegí un ejercicio y tu rol.");
    if (!name) return bad(`Escribí tu nombre (entre 2 y ${MAX_NAME} caracteres).`);
    let scheduledAt: string | null = null;
    if (typeof body.scheduledAt === "string" && body.scheduledAt) {
      const t = Date.parse(body.scheduledAt);
      if (!Number.isFinite(t) || t < Date.now() - 60 * 60 * 1000) return bad("Elegí una fecha y hora futura.");
      scheduledAt = new Date(t).toISOString();
    }
    const { data, error } = await admin
      .from("peer_rooms")
      .insert({
        exercise_slug: exercise.slug,
        host_id: user.id,
        host_name: name,
        host_role: role,
        scheduled_at: scheduledAt,
        is_public: body.isPublic !== false,
      })
      .select("id")
      .single();
    if (error) {
      console.error(error);
      return bad("No pudimos crear la sala. Probá de nuevo.", 500);
    }
    return Response.json({ id: data.id as string });
  }

  if (!isUuid(body.roomId)) return bad("Pedido inválido.");
  const { data: roomData, error: roomError } = await admin
    .from("peer_rooms")
    .select(ROOM_FIELDS)
    .eq("id", body.roomId)
    .maybeSingle();
  if (roomError) {
    console.error(roomError);
    return bad("No pudimos cargar la sala.", 500);
  }
  const room = roomData as RoomRow | null;
  if (!room) return bad("No encontramos esa sala.", 404);
  const isHost = room.host_id === user.id;
  const isGuest = room.guest_id === user.id;

  if (body.action === "join") {
    if (isHost || isGuest) return Response.json({ ok: true });
    if (room.status !== "open" || room.guest_id) return bad("Esta sala ya no está disponible.", 409);
    const name = cleanName(body.name);
    if (!name) return bad(`Escribí tu nombre (entre 2 y ${MAX_NAME} caracteres).`);
    // Solo se une si nadie se unió antes (evita que dos personas entren a la vez).
    const { data, error } = await admin
      .from("peer_rooms")
      .update({ guest_id: user.id, guest_name: name, status: "matched" })
      .eq("id", room.id)
      .eq("status", "open")
      .is("guest_id", null)
      .select("id");
    if (error) {
      console.error(error);
      return bad("No pudimos unirte a la sala. Probá de nuevo.", 500);
    }
    if (!data?.length) return bad("Alguien se unió antes que vos. Probá con otra sala.", 409);
    return Response.json({ ok: true });
  }

  if (body.action === "cancel") {
    if (!isHost) return bad("Solo quien creó la sala puede cancelarla.", 403);
    if (room.status === "done") return bad("La sala ya terminó.", 409);
    await admin.from("peer_rooms").update({ status: "cancelled" }).eq("id", room.id);
    return Response.json({ ok: true });
  }

  if (!isHost && !isGuest) return bad("No sos parte de esta sala.", 403);
  const myRole: PeerRole = isHost ? room.host_role : otherRole(room.host_role);

  if (body.action === "feedback") {
    if (myRole !== "evalua") return bad("El feedback lo completa quien evalúa.", 403);
    if (room.status !== "matched" && room.status !== "done") return bad("La sala todavía no tiene a las dos personas.", 409);
    const exercise = getExercise(room.exercise_slug);
    const raw = body.answers as Record<string, unknown> | undefined;
    if (!exercise || !raw || typeof raw !== "object") return bad("Completá la plantilla.");
    const answers: FeedbackAnswers = {};
    for (const q of exercise.questions) {
      const value = raw[q.id];
      if (q.kind === "escala") {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 5) return bad("Respondé todas las preguntas de 1 a 5.");
        answers[q.id] = n;
      } else {
        const text = typeof value === "string" ? value.trim() : "";
        if (text.length < 3 || text.length > MAX_TEXT_ANSWER) return bad("Completá las preguntas escritas.");
        answers[q.id] = text;
      }
    }
    const { error } = await admin
      .from("peer_feedback")
      .upsert({ room_id: room.id, author_id: user.id, answers }, { onConflict: "room_id,author_id" });
    if (error) {
      console.error(error);
      return bad("No pudimos guardar el feedback.", 500);
    }
    await admin.from("peer_rooms").update({ status: "done" }).eq("id", room.id);
    return Response.json({ ok: true });
  }

  if (body.action === "rematch") {
    if (!room.guest_id || !room.guest_name) return bad("La sala todavía no tiene a las dos personas.", 409);
    // Otra ronda con los mismos participantes y los roles invertidos. Queda privada.
    const { data, error } = await admin
      .from("peer_rooms")
      .insert({
        exercise_slug: typeof body.exercise === "string" && getExercise(body.exercise) ? body.exercise : room.exercise_slug,
        host_id: room.host_id,
        host_name: room.host_name,
        host_role: otherRole(room.host_role),
        guest_id: room.guest_id,
        guest_name: room.guest_name,
        is_public: false,
        status: "matched",
      })
      .select("id")
      .single();
    if (error) {
      console.error(error);
      return bad("No pudimos crear la nueva ronda.", 500);
    }
    return Response.json({ id: data.id as string });
  }

  return bad("Acción desconocida.");
}
