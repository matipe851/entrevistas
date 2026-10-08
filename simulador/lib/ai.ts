import "server-only";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import type { Turn } from "@/lib/sessions";

/**
 * Modelo Flash de Gemini. Se puede cambiar con GEMINI_MODEL sin tocar el código.
 * gemini-2.5-flash ya no está disponible para cuentas nuevas (404).
 */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

/** Modelo de respaldo cuando el principal está saturado (503). Se puede cambiar con GEMINI_FALLBACK_MODEL. */
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.7-flash";

const RETRYABLE = new Set([500, 503, 504]);

function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && RETRYABLE.has(error.status);
}

/**
 * Llama a Gemini con el modelo principal. Si está saturado (503 "high demand"),
 * reintenta una vez y, si sigue fallando, usa el modelo de respaldo.
 */
export async function withFallback<T>(call: (model: string) => Promise<T>): Promise<T> {
  try {
    return await call(MODEL);
  } catch (error) {
    if (!isRetryable(error)) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  try {
    return await call(MODEL);
  } catch (error) {
    if (!isRetryable(error) || FALLBACK_MODEL === MODEL) throw error;
  }
  return call(FALLBACK_MODEL);
}

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Historial en el formato de Gemini: el rol del personaje es "model". */
export function toContents(turns: Turn[]): Content[] {
  return turns.map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.content }],
  }));
}

export function logAiError(error: unknown) {
  if (error instanceof ApiError) {
    // 429 en el plan gratuito = se agotó la cuota por minuto o por día.
    console.error(`Error de la API de Gemini ${error.status}:`, error.message);
  } else {
    console.error(error);
  }
}
