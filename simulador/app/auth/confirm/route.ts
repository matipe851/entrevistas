import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Links de los mails (recuperar contraseña y confirmar cuenta).
 *
 * Los links de Supabase son de un solo uso. Gmail y otros correos abren los links
 * solos para revisarlos y así los "gastan" antes que el usuario. Por eso el GET solo
 * muestra un botón y el token se usa recién con el POST, cuando la persona lo toca.
 * Además funciona aunque el mail se abra en otro dispositivo o navegador.
 */

const TYPES: EmailOtpType[] = ["recovery", "signup", "email", "invite", "email_change", "magiclink"];

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/practicar";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash") ?? "";
  const type = searchParams.get("type") ?? "";
  const next = safeNext(searchParams.get("next"));
  const isRecovery = type === "recovery";

  const title = isRecovery ? "Elegí tu contraseña nueva" : "Confirmá tu cuenta";
  const button = isRecovery ? "Continuar" : "Confirmar y entrar";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Ensayo</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #141816; color: #e8ece9; font-family: system-ui, -apple-system, sans-serif; }
  main { width: 100%; max-width: 380px; padding: 24px; }
  h1 { font-family: Georgia, serif; font-weight: 400; font-size: 28px; margin: 0 0 8px; }
  p { color: #a3aca6; margin: 0 0 24px; line-height: 1.5; }
  button { width: 100%; padding: 12px; border: 0; border-radius: 6px; background: #5fc2a3; color: #0e1311; font-weight: 600; font-size: 16px; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  <p>Tocá el botón para seguir.</p>
  <form method="post">
    <input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}">
    <input type="hidden" name="type" value="${escapeHtml(type)}">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <button type="submit">${button}</button>
  </form>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType;
  const next = safeNext(String(form.get("next") ?? ""));

  if (tokenHash && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin), { status: 303 });
    console.error(error);
  }
  return NextResponse.redirect(new URL("/login?error=link", origin), { status: 303 });
}
