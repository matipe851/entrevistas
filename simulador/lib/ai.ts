import "server-only";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import type { Turn } from "@/lib/sessions";

/**
 * Modelo principal de Gemini. Se puede cambiar con GEMINI_MODEL sin tocar el código.
 * gemini-2.5-flash ya no está disponible para cuentas nuevas (404) y gemini-3.8-flash,
 * recién salido, suele estar saturado: por eso el principal es 3.7 y el respaldo 3.8.
 */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

/** Modelo de respaldo si el principal falla, se satura o tarda demasiado. Se cambia con GEMINI_FALLBACK_MODEL. */
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.8-flash";

/** Tope por pedido a Gemini: si no responde en este tiempo, probamos con el modelo de respaldo. */
export const AI_TIMEOUT_MS = 50_000;

/** Errores 4xx (pedido inválido, sin permiso) no se arreglan cambiando de modelo; el resto sí (429, 5xx, timeout, red). */
function shouldFallback(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500;
  return true;
}

/**
 * Llama a Gemini con el modelo principal y, si falla por saturación, cuota o demora,
 * repite el pedido con el modelo de respaldo.
 */
export async function withFallback<T>(call: (model: string) => Promise<T>): Promise<T> {
  try {
    return await call(MODEL);
  } catch (error) {
    if (!shouldFallback(error) || FALLBACK_MODEL === MODEL) throw error;
    logAiError(error);
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
