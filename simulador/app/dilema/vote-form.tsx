"use client";

import { track } from "@vercel/analytics";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicDilemma } from "@/lib/dilemmas";

type Mode = "opciones" | "libre";

export default function VoteForm({ dilemma }: { dilemma: PublicDilemma }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("opciones");
  const [choice, setChoice] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = mode === "opciones" ? !!choice : answer.trim().length >= 20;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || pending) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/dilema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "opciones" ? { choice } : { answer }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(data?.error ?? "No pudimos guardar tu respuesta. Probá de nuevo.");
      setPending(false);
      return;
    }
    track("dilema_respondido", { dilema: dilemma.id, modo: mode });
    router.refresh();
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
        mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="mt-6">
      <div className="inline-flex gap-1 rounded-lg border border-line bg-surface p-1">
        {tab("opciones", "Elegir una opción")}
        {tab("libre", "Escribir mi solución")}
      </div>

      {mode === "opciones" ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Opciones</legend>
          {dilemma.options.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${
                choice === o.id ? "border-accent bg-surface" : "border-line bg-surface hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="choice"
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <b className="uppercase">{o.id})</b> {o.text}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="mt-4">
          <label htmlFor="answer" className="text-sm font-semibold">
            ¿Qué harías vos? Contalo con tus palabras.
          </label>
          <textarea
            id="answer"
            rows={6}
            maxLength={1500}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent"
            placeholder="Primero haría… porque…"
          />
          <p className="mt-1 text-xs text-muted">La IA compara tu enfoque con los principios de liderazgo del caso.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSend || pending}
        className="mt-4 rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
      >
        {pending ? (mode === "libre" ? "Evaluando…" : "Guardando…") : "Responder"}
      </button>
      <p className="mt-2 text-xs text-muted">Una respuesta por día. Después ves qué eligieron los demás y la explicación.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
