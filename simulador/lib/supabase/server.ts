import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSupabaseEnv, supabaseEnv } from "./env";

/** Cliente que actúa como el usuario logueado: la base aplica RLS. */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy ya refresca la sesión.
        }
      },
    },
  });
}

/** Cliente con la service role key: saltea RLS. Usar solo en el servidor y después de verificar al usuario. */
export function createAdmin() {
  const { url } = requireSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  return createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CurrentUser = { id: string; email: string | null };

/** El usuario logueado, o null. Si Supabase no está configurado, también null. */
export async function getUser(): Promise<CurrentUser | null> {
  // Leer cookies siempre marca la página como dinámica, aunque falte configurar Supabase en el build.
  await cookies();
  if (!supabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

/** Para páginas privadas: manda al login si no hay sesión. */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
