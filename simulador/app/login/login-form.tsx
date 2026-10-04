"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Mode = "entrar" | "crear" | "olvide";

const MIN_PASSWORD = 8;

const inputClass =
  "rounded-md border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent";

function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

/** Traduce los errores de Supabase Auth que puede ver el usuario. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Todavía no confirmaste tu email. Revisá tu casilla (y spam).";
  if (m.includes("already registered")) return "Ya hay una cuenta con ese email. Entrá o recuperá tu contraseña.";
  if (m.includes("password")) return `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`;
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Esperá un rato y probá de nuevo.";
  return "Algo salió mal. Probá de nuevo en un minuto.";
}

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchTo(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const cleanEmail = email.trim();

    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) return setError(friendly(error.message));
        router.replace(next);
        router.refresh();
        return;
      }

      if (mode === "crear") {
        if (password.length < MIN_PASSWORD) {
          return setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
        }
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: callbackUrl("/practicar") },
        });
        if (error) return setError(friendly(error.message));
        if (data.session) {
          router.replace("/practicar");
          router.refresh();
          return;
        }
        setNotice(
          `Te mandamos un mail a ${cleanEmail} para confirmar que es tuyo. Confirmalo una sola vez y después entrás con tu contraseña.`,
        );
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: callbackUrl("/cuenta/clave"),
      });
      if (error) return setError(friendly(error.message));
      setNotice(`Si hay una cuenta con ${cleanEmail}, te llega un mail para elegir una contraseña nueva.`);
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    entrar: "Entrar",
    crear: "Crear cuenta",
    olvide: "Mandarme el mail",
  };

  return (
    <div className="mt-6">
      {mode !== "olvide" && (
        <div role="tablist" className="grid grid-cols-2 rounded-md border border-line p-1 text-sm">
          {(["entrar", "crear"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchTo(m)}
              className={`rounded px-3 py-1.5 font-semibold ${
                mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "entrar" ? "Ya tengo cuenta" : "Soy nuevo"}
            </button>
          ))}
        </div>
      )}

      {notice ? (
        <p className="mt-6 rounded-lg border border-line bg-surface p-4">{notice}</p>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          {mode === "olvide" && (
            <p className="text-sm text-muted">Te mandamos un mail para que elijas una contraseña nueva.</p>
          )}
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className={inputClass}
          />
          {mode !== "olvide" && (
            <>
              <label htmlFor="password" className="text-sm font-semibold">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={mode === "crear" ? MIN_PASSWORD : undefined}
                autoComplete={mode === "crear" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {mode === "crear" && (
                <p className="text-xs text-muted">Mínimo {MIN_PASSWORD} caracteres.</p>
              )}
            </>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-40"
          >
            {busy ? "Un momento…" : titles[mode]}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
        </form>
      )}

      <div className="mt-4 text-sm">
        {mode === "olvide" ? (
          <button type="button" onClick={() => switchTo("entrar")} className="text-accent hover:underline">
            ← Volver a entrar
          </button>
        ) : (
          mode === "entrar" && (
            <button type="button" onClick={() => switchTo("olvide")} className="text-muted hover:text-foreground">
              Olvidé mi contraseña
            </button>
          )
        )}
      </div>
    </div>
  );
}
