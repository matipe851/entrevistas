import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.CHAT_MODEL ?? "claude-opus-5-5";

// Si un clasificador de seguridad rechaza un pedido, la API lo reintenta con otro modelo.
export const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY.");
  client ??= new Anthropic();
  return client;
}

export function logClaudeError(error: unknown) {
  if (error instanceof Anthropic.RateLimitError) {
    console.error("Rate limit de la API de Claude:", error.message);
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Error de la API de Claude ${error.status}:`, error.message);
  } else {
    console.error(error);
  }
}
