import { claude, FALLBACK, logClaudeError, MODEL } from "@/lib/claude";
import { buildPersonaPrompt, getScenario, MAX_USER_TURNS } from "@/lib/scenarios";
import { getOwnSession, getTurns, toMessageParams } from "@/lib/sessions";
import { createAdmin, getUser } from "@/lib/supabase/server";

const MAX_MESSAGE_CHARS = 1500;

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: unknown; message?: unknown }
    | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (typeof body?.sessionId !== "string" || !message || message.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const session = await getOwnSession(body.sessionId, user.id);
  const scenario = session && getScenario(session.scenario_slug);
  if (!session || !scenario) return Response.json({ error: "No encontramos esa práctica." }, { status: 404 });
  if (session.status !== "active") {
    return Response.json({ error: "Esta práctica ya terminó." }, { status: 409 });
  }

  // El historial sale de la base, no del navegador.
  const turns = await getTurns(session.id);
  if (turns.filter((t) => t.role === "user").length >= MAX_USER_TURNS) {
    return Response.json(
      { error: `La práctica tiene un máximo de ${MAX_USER_TURNS} mensajes.` },
      { status: 409 },
    );
  }

  let anthropic;
  try {
    anthropic = claude();
  } catch (error) {
    console.error(error);
    return Response.json({ error: "El servidor no tiene configurada la IA." }, { status: 500 });
  }

  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    // Charla en vivo: poco razonamiento previo para que la respuesta empiece rápido.
    output_config: { effort: "low" },
    system: buildPersonaPrompt(scenario),
    messages: [...toMessageParams(turns), { role: "user", content: message }],
    ...FALLBACK,
  });

  const encoder = new TextEncoder();
  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      let reply = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            reply += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" || !reply.trim()) {
          controller.enqueue(encoder.encode("\n\n[El personaje no puede seguir con esta respuesta. Probá reformular.]"));
          controller.close();
          return;
        }
        // Guardamos el par solo si la respuesta llegó completa: el historial sigue alternando.
        const { error } = await createAdmin()
          .from("messages")
          .insert([
            { session_id: session.id, role: "user", content: message },
            { session_id: session.id, role: "assistant", content: reply.trim() },
          ]);
        if (error) throw error;
        controller.close();
      } catch (error) {
        logClaudeError(error);
        controller.error(error);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(responseBody, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
