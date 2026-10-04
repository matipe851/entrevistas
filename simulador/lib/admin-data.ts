import "server-only";
import type { AccountStatus } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

export type ProfileRow = {
  id: string;
  email: string;
  status: AccountStatus;
  created_at: string;
  decided_at: string | null;
};

export type Scores = {
  score_tone: number;
  score_assertive: number;
  score_empathy: number;
  score_clarity: number;
};

export type AdminSessionRow = {
  id: string;
  user_id: string;
  scenario_slug: string;
  status: "active" | "finished";
  created_at: string;
  feedback: Scores | Scores[] | null;
};

/** PostgREST devuelve la relación 1 a 1 como objeto, pero aceptamos también una lista. */
export function feedbackOf(row: AdminSessionRow): Scores | null {
  return Array.isArray(row.feedback) ? (row.feedback[0] ?? null) : row.feedback;
}

export function average(f: Scores): number {
  return (f.score_tone + f.score_assertive + f.score_empathy + f.score_clarity) / 4;
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await createAdmin()
    .from("profiles")
    .select("id, email, status, created_at, decided_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function listSessions(limit = 5000): Promise<AdminSessionRow[]> {
  const { data, error } = await createAdmin()
    .from("sessions")
    .select("id, user_id, scenario_slug, status, created_at, feedback(score_tone, score_assertive, score_empathy, score_clarity)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AdminSessionRow[];
}

export const dateFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});
