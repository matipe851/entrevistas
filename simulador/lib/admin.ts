/**
 * Emails de administrador. Se pueden cambiar con ADMIN_EMAIL (separados por coma)
 * sin tocar el código. Solo cuentan si Supabase confirmó el email.
 */
const DEFAULT_ADMINS = "matipealv@gmail.com";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? DEFAULT_ADMINS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.trim().toLowerCase());
}
