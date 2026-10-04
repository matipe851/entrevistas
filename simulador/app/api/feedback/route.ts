import { ApiError } from "@google/genai";
import { logAiError } from "@/lib/ai";
import { generateFeedback } from "@/lib/feedback";
import { getScenario } from "@/lib/scenarios";
import { getOwnSession, getTurns } from "@/lib/sessions";
import { approvedOrError } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const gate = await approvedOrError();
  if ("response" in gate) return gate.response;
  const user = gate.access;

  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  if (typeof body?.sessionId !== "string") {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const session = await getOwnSession(body.sessionId, user.id);
  const scenario = session && getScenario(session.scenario_slug);
  if (!session || !scenario) return Response.json({ error: "No encontramos esa práctica." }, { status: 404 });

  const admin = createAdmin();
  const { data: existing } = await admin
    .from("feedback")
    .select("session_id")
    .eq("session_id", session.id)
    .maybeSingle();
  if (existing) return Response.json({ ok: true });

  const turns = await getTurns(session.id);
  if (!turns.some((t) => t.role === "user")) {
    return Response.json({ error: "Escribí al menos un mensaje antes de pedir el diagnóstico." }, { status: 400 });
  }

  let feedback;
  try {
    feedback = await generateFeedback(session.id, scenario, turns);
  } catch (error) {
    logAiError(error);
    if (error instanceof ApiError && error.status === 429) {
      return Response.json(
        { error: "Se agotó la cuota gratuita de la IA por ahora. Probá de nuevo en un rato." },
        { status: 429 },
      );
    }
    return Response.json({ error: "No pudimos generar el diagnóstico. Probá de nuevo." }, { status: 502 });
  }

  const { error } = await admin.from("feedback").upsert(feedback, {
    onConflict: "session_id",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error(error);
    return Response.json({ error: "No pudimos guardar el diagnóstico." }, { status: 500 });
  }
  await admin
    .from("sessions")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", session.id);

  return Response.json({ ok: true });
}
