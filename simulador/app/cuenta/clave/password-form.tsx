"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const MIN_PASSWORD = 8;
const inputClass =
  "rounded-md border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent";

export default function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== repeat) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("different")
          ? "Elegí una contraseña distinta de la anterior."
          : "No pudimos guardar la contraseña. Pedí otro mail y probá de nuevo.",
      );
      return;
    }
    router.replace("/practicar");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label htmlFor="password" className="text-sm font-semibold">
        Contraseña nueva
      </label>
      <input
        id="password"
        type="password"
        required
        minLength={MIN_PASSWORD}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <label htmlFor="repeat" className="text-sm font-semibold">
        Repetila
      </label>
      <input
        id="repeat"
        type="password"
        required
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-40"
      >
        {busy ? "Guardando…" : "Guardar contraseña"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
