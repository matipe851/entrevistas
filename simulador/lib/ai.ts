import "server-only";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import type { Turn } from "@/lib/sessions";

/** Flash tiene plan gratuito en Google AI Studio. Se puede cambiar con GEMINI_MODEL. */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

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
