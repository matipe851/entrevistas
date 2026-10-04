import Anthropic from "@anthropic-ai/sdk";
import { buildPersonaPrompt, getScenario, MAX_USER_TURNS } from "@/lib/scenarios";

const client = new Anthropic();
const MODEL = process.env.CHAT_MODEL ?? "claude-opus-5-5";
const MAX_MESSAGE_CHARS = 1500;

type ChatBody = {
  scenario?: unknown;
  messages?: unknown;
};

function parseMessages(raw: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Anthropic.MessageParam[] = [];
  for (const [i, m] of raw.entries()) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    // Alternan user / assistant, empezando y terminando en user.
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (role !== expected || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS) return null;
    out.push({ role: expected, content: text });
  }
  return out[out.length - 1].role === "user" ? out : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const scenario = typeof body?.scenario === "string" ? getScenario(body.scenario) : undefined;
  const messages = parseMessages(body?.messages);

  if (!scenario || !messages) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta configurar ANTHROPIC_API_KEY en el servidor." }, { status: 500 });
  }
  const userTurns = messages.filter((m) => m.role === "user").length;
  if (userTurns > MAX_USER_TURNS) {
    return Response.json(
      { error: `La práctica tiene un máximo de ${MAX_USER_TURNS} mensajes.` },
      { status: 400 },
    );
  }

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    // Charla en vivo: poco razonamiento previo para que la respuesta empiece rápido.
    output_config: { effort: "low" },
    system: buildPersonaPrompt(scenario),
    messages,
    // Si un clasificador de seguridad rechaza el pedido, la API lo reintenta con otro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[El personaje no puede seguir con esta respuesta. Probá reformular.]"));
        }
        controller.close();
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          console.error("Rate limit de la API de Claude", error.message);
        } else if (error instanceof Anthropic.APIError) {
          console.error(`Error de la API de Claude ${error.status}:`, error.message);
        } else {
          console.error(error);
        }
        controller.error(error);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body$, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
