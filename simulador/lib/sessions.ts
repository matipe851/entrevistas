import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAdmin } from "@/lib/supabase/server";
import { DAILY_SESSIONS, startOfTodayAR } from "@/lib/limits";

export type SessionRow = {
  id: string;
  user_id: string;
  scenario_slug: string;
  status: "active" | "finished";
  created_at: string;
};

export type Turn = { role: "user" | "assistant"; content: string };

/** Sesión del usuario, o null si no existe o es de otra persona. */
export async function getOwnSession(sessionId: string, userId: string): Promise<SessionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const { data, error } = await createAdmin()
    .from("sessions")
    .select("id, user_id, scenario_slug, status, created_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as SessionRow | null;
}

export async function getTurns(sessionId: string): Promise<Turn[]> {
  const { data, error } = await createAdmin()
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Turn[];
}

export async function sessionsStartedToday(userId: string): Promise<number> {
  const { count, error } = await createAdmin()
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfTodayAR());
  if (error) throw error;
  return count ?? 0;
}

export async function remainingToday(userId: string): Promise<number> {
  return Math.max(0, DAILY_SESSIONS - (await sessionsStartedToday(userId)));
}

/** Historial para la API de Claude: alterna user/assistant empezando por user. */
export function toMessageParams(turns: Turn[]): Anthropic.MessageParam[] {
  return turns.map((t) => ({ role: t.role, content: t.content }));
}
