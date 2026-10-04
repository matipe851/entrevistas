"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MAX_USER_TURNS, type Scenario } from "@/lib/scenarios";

type Turn = { role: "user" | "assistant"; content: string };

export default function Chat({ scenario }: { scenario: Scenario }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const userTurns = turns.filter((t) => t.role === "user").length;
  const finished = userTurns >= MAX_USER_TURNS && !streaming;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || streaming || userTurns >= MAX_USER_TURNS) return;

    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setError(null);
    setStreaming(true);

    const ctl = new AbortController();
    abortRef.current = ctl;
    let reply = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenario.slug, messages: history }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "No pudimos conectar con el personaje.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setTurns([...history, { role: "assistant", content: reply }]);
      }
      if (!reply.trim()) throw new Error("El personaje no respondió. Probá de nuevo.");
    } catch (err) {
      if (ctl.signal.aborted) return;
      // Sacamos el mensaje que falló para que el historial siga alternando user/assistant.
      setTurns(turns);
      setDraft(text);
      setError(err instanceof Error ? err.message : "Algo salió mal. Probá de nuevo.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Todas las situaciones
      </Link>

      <details className="mt-3 rounded-lg border border-line bg-surface p-4" open>
        <summary className="cursor-pointer font-display text-lg">{scenario.title}</summary>
        <p className="mt-2 text-sm">{scenario.context}</p>
        <p className="mt-2 text-sm">
          <strong className="font-semibold">Tu objetivo:</strong> {scenario.userGoal}
        </p>
      </details>

      <section className="mt-4 flex flex-1 flex-col gap-3" aria-live="polite">
        <Bubble role="assistant" who={scenario.persona} text={scenario.opening} />
        {turns.map((t, i) => (
          <Bubble
            key={i}
            role={t.role}
            who={t.role === "user" ? "Vos" : scenario.persona}
            text={t.content || "…"}
          />
        ))}
        <div ref={endRef} />
      </section>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {finished ? (
        <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm">
          Llegaste a los {MAX_USER_TURNS} mensajes. El diagnóstico llega en la próxima versión.{" "}
          <Link href="/" className="font-semibold text-accent">
            Probar otra situación
          </Link>
        </p>
      ) : (
        <form onSubmit={send} className="sticky bottom-0 mt-4 flex gap-2 bg-background py-3">
          <label htmlFor="mensaje" className="sr-only">
            Tu respuesta
          </label>
          <textarea
            id="mensaje"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={1500}
            placeholder="Escribí lo que le dirías…"
            className="min-w-0 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
          />
          <div className="flex flex-col items-end justify-between">
            <button
              type="submit"
              disabled={streaming || !draft.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40"
            >
              Enviar
            </button>
            <span className="text-xs tabular-nums text-muted">
              {userTurns}/{MAX_USER_TURNS}
            </span>
          </div>
        </form>
      )}
    </main>
  );
}

function Bubble({ role, who, text }: { role: Turn["role"]; who: string; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="mb-1 text-xs text-muted">{who}</span>
      <p
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm ${
          mine ? "bg-accent text-accent-ink" : "bg-persona"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
