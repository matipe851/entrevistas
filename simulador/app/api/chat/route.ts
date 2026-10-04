import { ApiError, FinishReason } from "@google/genai";
import { gemini, logAiError, MODEL, toContents } from "@/lib/ai";
import { buildPersonaPrompt, getScenario, MAX_USER_TURNS } from "@/lib/scenarios";
import { getOwnSession, getTurns } from "@/lib/sessions";
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

  const abort = new AbortController();
  let stream;
  try {
    stream = await gemini().models.generateContentStream({
      model: MODEL,
      contents: [...toContents(turns), { role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction: buildPersonaPrompt(scenario),
        maxOutputTokens: 1024,
        // Charla en vivo: sin razonamiento previo para que la respuesta empiece rápido.
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: abort.signal,
      },
    });
  } catch (error) {
    logAiError(error);
    if (error instanceof ApiError && error.status === 429) {
      return Response.json(
        { error: "Se agotó la cuota gratuita de la IA por ahora. Probá de nuevo en un rato." },
        { status: 429 },
      );
    }
    const missingKey = error instanceof Error && error.message.includes("GEMINI_API_KEY");
    return Response.json(
      { error: missingKey ? "El servidor no tiene configurada la IA." : "No pudimos conectar con el personaje." },
      { status: missingKey ? 500 : 502 },
    );
  }

  const encoder = new TextEncoder();
  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      let reply = "";
      let blocked = false;
      try {
        for await (const chunk of stream) {
          const finish = chunk.candidates?.[0]?.finishReason;
          if (chunk.promptFeedback?.blockReason || finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT) {
            blocked = true;
          }
          const text = chunk.text;
          if (text) {
            reply += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        if (blocked || !reply.trim()) {
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
        logAiError(error);
        controller.error(error);
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(responseBody, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
