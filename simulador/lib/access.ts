import "server-only";
import { notFound, redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { createAdmin, getUser, requireUser, type CurrentUser } from "@/lib/supabase/server";

export type AccountStatus = "pending" | "approved" | "denied";

export type Access = CurrentUser & { isAdmin: boolean; status: AccountStatus };

/** Estado de la cuenta según su perfil. Si todavía no tiene perfil, cuenta como pendiente. */
async function statusOf(user: CurrentUser): Promise<AccountStatus> {
  const { data, error } = await createAdmin()
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.status as AccountStatus | undefined) ?? "pending";
}

/** Admin solo si el email coincide Y Supabase lo confirmó: nadie puede registrarse con el mail ajeno. */
async function isConfirmedAdmin(user: CurrentUser): Promise<boolean> {
  if (!isAdminEmail(user.email)) return false;
  const { data, error } = await createAdmin().auth.admin.getUserById(user.id);
  if (error || !data.user) return false;
  return isAdminEmail(data.user.email) && !!data.user.email_confirmed_at;
}

export async function accessFor(user: CurrentUser): Promise<Access> {
  const isAdmin = await isConfirmedAdmin(user);
  return { ...user, isAdmin, status: isAdmin ? "approved" : await statusOf(user) };
}

/** El usuario logueado con su estado, o null. */
export async function getAccess(): Promise<Access | null> {
  const user = await getUser();
  return user ? accessFor(user) : null;
}

/** Para páginas de práctica: login obligatorio y cuenta aprobada. */
export async function requireApproved(next: string): Promise<Access> {
  const access = await accessFor(await requireUser(next));
  if (access.status !== "approved") redirect("/pendiente");
  return access;
}

/** Para el panel: solo el administrador. A los demás les responde 404. */
export async function requireAdmin(): Promise<Access> {
  const access = await accessFor(await requireUser("/admin"));
  if (!access.isAdmin) notFound();
  return access;
}

/** Para las API de práctica: devuelve el usuario aprobado o la respuesta de error. */
export async function approvedOrError(): Promise<{ access: Access } | { response: Response }> {
  const user = await getUser();
  if (!user) {
    return { response: Response.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 }) };
  }
  const access = await accessFor(user);
  if (access.status !== "approved") {
    return {
      response: Response.json(
        { error: "Tu cuenta todavía no está habilitada para practicar." },
        { status: 403 },
      ),
    };
  }
  return { access };
}
