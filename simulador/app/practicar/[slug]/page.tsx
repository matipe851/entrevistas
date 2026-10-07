import Link from "next/link";
import { notFound } from "next/navigation";
import Difficulty from "@/components/difficulty";
import { getScenario, MAX_USER_TURNS, type Theory } from "@/lib/scenarios";
import { remainingToday } from "@/lib/sessions";
import { requireApproved } from "@/lib/access";
import StartButton from "./start-button";

export default async function ScenarioPage(props: PageProps<"/practicar/[slug]">) {
  const { slug } = await props.params;
  const scenario = getScenario(slug);
  if (!scenario) notFound();
  const user = await requireApproved(`/practicar/${slug}`);
  const remaining = user.isAdmin ? Infinity : await remainingToday(user.id);
  const repeat = (await props.searchParams).repetir === "1";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/practicar" className="text-sm text-muted hover:text-foreground">
        ← Todas las situaciones
      </Link>
      <div className="mt-4 rounded-lg border border-line bg-surface p-6">
        <Difficulty level={scenario.difficulty} />
        <h1 className="mt-2 font-display text-3xl">{scenario.title}</h1>
        <p className="mt-1 text-muted">Con {scenario.persona}</p>
        <p className="mt-4">{scenario.context}</p>
        <p className="mt-3">
          <strong className="font-semibold">Tu objetivo:</strong> {scenario.userGoal}
        </p>
        <TheoryBlock theory={scenario.theory} />
        <p className="mt-6 text-sm text-muted">
          Tenés hasta {MAX_USER_TURNS} mensajes. Cuando quieras, tocá “Terminar y ver diagnóstico”.
        </p>
        <StartButton scenario={scenario.slug} disabled={remaining === 0} repeat={repeat} />
        {remaining === 0 && (
          <p className="mt-2 text-sm text-muted">Ya usaste tus prácticas de hoy. Mañana tenés más.</p>
        )}
      </div>
    </main>
  );
}

/** Teoría para leer antes de practicar: la técnica, los pasos, frases de ejemplo y errores comunes. */
function TheoryBlock({ theory }: { theory: Theory }) {
  return (
    <section className="mt-6 border-t border-line pt-6">
      <h2 className="font-display text-xl">Antes de practicar</h2>
      <p className="mt-2">{theory.technique}</p>

      <h3 className="mt-5 text-sm font-semibold">Paso a paso</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {theory.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h3 className="mt-5 text-sm font-semibold">Frases que te pueden servir</h3>
      <ul className="mt-2 space-y-2">
        {theory.phrases.map((phrase) => (
          <li key={phrase} className="border-l-2 border-accent pl-3 italic">
            “{phrase}”
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-sm font-semibold">Evitá</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        {theory.avoid.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <p className="mt-5 text-sm text-muted">
        No hace falta seguirlo al pie de la letra: usalo como guía y probá con tus palabras.
      </p>
    </section>
  );
}
