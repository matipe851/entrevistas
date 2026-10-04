/** Prácticas gratis por día y por usuario. */
export const DAILY_SESSIONS = 3;

/** Inicio del día de hoy en Argentina (UTC-3, sin horario de verano), como ISO. */
export function startOfTodayAR(now = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}
