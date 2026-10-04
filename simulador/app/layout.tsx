import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { isAdminEmail } from "@/lib/admin";
import { getUser } from "@/lib/supabase/server";
import "./globals.css";

const display = Fraunces({ variable: "--font-display", subsets: ["latin"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ensayo · Simulador de conversaciones difíciles",
  description: "Practicá la conversación que venís evitando y recibí un diagnóstico de cómo te fue.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  return (
    <html lang="es" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-display text-lg font-semibold">
              Ensayo
            </Link>
            <div className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  {isAdminEmail(user.email) && (
                    <Link href="/admin" className="font-semibold text-accent hover:opacity-80">
                      Admin
                    </Link>
                  )}
                  <Link href="/practicar" className="hover:text-accent">
                    Mis prácticas
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="text-muted hover:text-foreground">
                      Salir
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="font-semibold text-accent">
                  Entrar
                </Link>
              )}
            </div>
          </nav>
        </header>
        {children}
        <footer className="mx-auto w-full max-w-4xl px-4 py-8 text-xs text-muted">
          Herramienta de práctica. No es terapia ni asesoramiento profesional.
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
