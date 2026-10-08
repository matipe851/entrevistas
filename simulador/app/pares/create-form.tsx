"use client";

import { track } from "@vercel/analytics";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PeerRole } from "@/lib/peer";

const field = "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent";

export default function CreateForm({
  exercises,
  suggestedName,
}: {
  exercises: { slug: string; title: string }[];
  suggestedName: string;
}) {
  const router = useRouter();
  const [exercise, setExercise] = useState(exercises[0]?.slug ?? "");
  const [role, setRole] = useState<PeerRole>("practica");
  const [name, setName] = useState(suggestedName);
  const [when, setWhen] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/pares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        exercise,
        role,
        name,
        // datetime-local viene sin zona horaria: lo convertimos con la hora local del navegador.
        scheduledAt: when ? new Date(when).toISOString() : null,
        isPublic,
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res?.ok || !data?.id) {
      setError(data?.error ?? "No pudimos crear la sala. Probá de nuevo.");
      setPending(false);
      return;
    }
    track("pares_sala_creada", { ejercicio: exercise, rol: role });
    router.push(`/pares/sala/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-5">
      <label className="block text-sm font-semibold">
        Ejercicio
        <select value={exercise} onChange={(e) => setExercise(e.target.value)} className={field}>
          {exercises.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.title}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold">Tu rol en esta ronda</legend>
        <div className="mt-1 flex gap-4">
          {(["practica", "evalua"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                checked={role === r}
                onChange={() => setRole(r)}
                className="accent-[var(--accent)]"
              />
              {r === "practica" ? "Quiero practicar" : "Quiero evaluar"}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-semibold">
        Tu nombre (como te va a ver la otra persona)
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className={field} />
      </label>

      <label className="block text-sm font-semibold">
        Cuándo <span className="font-normal text-muted">(opcional)</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-1 accent-[var(--accent)]"
        />
        <span>
          Publicarla en “Salas abiertas” para que se sume cualquiera.
          <span className="block text-muted">Si no, solo entra quien tenga el link.</span>
        </span>
      </label>

      <button
        type="submit"
        disabled={pending || name.trim().length < 2}
        className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
      >
        {pending ? "Creando…" : "Crear sala"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
