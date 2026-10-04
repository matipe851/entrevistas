import Link from "next/link";
import Difficulty from "@/components/difficulty";
import { DAILY_SESSIONS } from "@/lib/limits";
import { MAX_USER_TURNS, scenarios } from "@/lib/scenarios";

const STEPS = [
  { title: "Elegí la situación", text: "Pedir un aumento, dar feedback negativo, atender a un cliente enojado y más." },
  { title: "Hablá con el personaje", text: `Reacciona a cómo le hablás. Tenés hasta ${MAX_USER_TURNS} mensajes.` },
  { title: "Mirá tu diagnóstico", text: "Tono, asertividad, empatía, claridad y tus frases reescritas mejor." },
];

export default function Landing() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <section className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Ensayo</p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-balance sm:text-5xl">
          Practicá la conversación que venís evitando
        </h1>
        <p className="mt-4 text-lg text-muted">
          Un personaje con IA hace de tu jefa, tu compañero o tu cliente. Vos practicás sin
          consecuencias y al final recibís un diagnóstico concreto de cómo te fue.
        </p>
        <Link
          href="/practicar"
          className="mt-6 inline-block rounded-md bg-accent px-5 py-3 font-semibold text-accent-ink hover:opacity-90"
        >
          Probar gratis
        </Link>
        <p className="mt-2 text-sm text-muted">{DAILY_SESSIONS} prácticas gratis por día. Entrás con tu email y contraseña.</p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl">Cómo funciona</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-surface p-5">
              <span className="text-sm font-semibold text-accent tabular-nums">Paso {i + 1}</span>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl">Situaciones para practicar</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {scenarios.map((s) => (
            <li key={s.slug} className="rounded-lg border border-line bg-surface p-4">
              <Difficulty level={s.difficulty} />
              <p className="mt-1 font-semibold">{s.title}</p>
              <p className="text-sm text-muted">Con {s.persona}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
