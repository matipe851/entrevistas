"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const redirect = new URL("/auth/callback", window.location.origin);
    redirect.searchParams.set("next", next);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect.toString() },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="mt-6 rounded-lg border border-line bg-surface p-4">
        Listo. Revisá <strong>{email}</strong> y tocá el link para entrar.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-semibold">
        Tu email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        className="rounded-md border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-40"
      >
        {status === "sending" ? "Enviando…" : "Enviarme el link"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          No pudimos mandar el link. Revisá el email y probá de nuevo en un minuto.
        </p>
      )}
    </form>
  );
}
