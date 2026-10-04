"use client";

import { track } from "@vercel/analytics";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartButton({
  scenario,
  disabled,
  repeat,
}: {
  scenario: string;
  disabled: boolean;
  repeat: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res?.ok || !data?.id) {
      setError(data?.error ?? "No pudimos empezar la práctica. Probá de nuevo.");
      setPending(false);
      return;
    }
    track("practica_iniciada", { escenario: scenario, repetida: repeat });
    router.push(`/sesion/${data.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled || pending}
        className="mt-6 rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
      >
        {pending ? "Preparando…" : "Empezar la práctica"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
