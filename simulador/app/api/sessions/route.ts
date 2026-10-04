import { DAILY_SESSIONS } from "@/lib/limits";
import { getScenario } from "@/lib/scenarios";
import { sessionsStartedToday } from "@/lib/sessions";
import { approvedOrError } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const gate = await approvedOrError();
  if ("response" in gate) return gate.response;
  const user = gate.access;

  const body = (await request.json().catch(() => null)) as { scenario?: unknown } | null;
  const scenario = typeof body?.scenario === "string" ? getScenario(body.scenario) : undefined;
  if (!scenario) return Response.json({ error: "Esa situación no existe." }, { status: 400 });

  // El administrador no tiene tope diario.
  if (!user.isAdmin && (await sessionsStartedToday(user.id)) >= DAILY_SESSIONS) {
    return Response.json(
      { error: `Ya hiciste tus ${DAILY_SESSIONS} prácticas de hoy. Volvé mañana.` },
      { status: 429 },
    );
  }

  const { data, error } = await createAdmin()
    .from("sessions")
    .insert({ user_id: user.id, scenario_slug: scenario.slug })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    return Response.json({ error: "No pudimos crear la práctica. Probá de nuevo." }, { status: 500 });
  }
  return Response.json({ id: data.id as string });
}
