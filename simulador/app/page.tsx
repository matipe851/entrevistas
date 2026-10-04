import Link from "next/link";
import { scenarios } from "@/lib/scenarios";

function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  const label = ["Fácil", "Media", "Difícil"][level - 1];
  return (
    <span className="text-xs uppercase tracking-wider text-muted" aria-label={`Dificultad ${label}`}>
      {"●".repeat(level)}
      <span className="opacity-30">{"●".repeat(3 - level)}</span> {label}
    </span>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Ensayo</p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-balance sm:text-5xl">
          Practicá la conversación que venís evitando
        </h1>
        <p className="mt-4 text-lg text-muted">
          Elegí una situación, hablá con un personaje que reacciona a lo que le decís y practicá sin
          consecuencias. Máximo 10 mensajes por práctica.
        </p>
      </header>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {scenarios.map((s) => (
          <li key={s.slug} className="flex flex-col rounded-lg border border-line bg-surface p-5">
            <Difficulty level={s.difficulty} />
            <h2 className="mt-2 font-display text-xl">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">Con {s.persona}</p>
            <p className="mt-3 flex-1 text-sm">
              <strong className="font-semibold">Tu objetivo:</strong> {s.userGoal}
            </p>
            <Link
              href={`/practicar/${s.slug}`}
              className="mt-4 self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Empezar
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs text-muted">
        Herramienta de práctica. No es terapia ni asesoramiento profesional.
      </p>
    </main>
  );
}
