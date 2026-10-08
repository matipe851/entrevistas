import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PRIVATE_PREFIXES = ["/practicar", "/sesion", "/admin", "/pendiente", "/cuenta", "/oratoria", "/dilema", "/pares"];

/** Refresca la sesión de Supabase en cada pedido y protege las páginas privadas. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  if (!data?.claims && PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico).*)"],
};
