import Link from "next/link";
import { notFound } from "next/navigation";
import { getChallenge } from "@/lib/oratoria";
import { requireApproved } from "@/lib/access";
import Recorder from "./recorder";

export default async function ChallengePage(props: PageProps<"/oratoria/[slug]">) {
  const { slug } = await props.params;
  const challenge = getChallenge(slug);
  if (!challenge) notFound();
  await requireApproved(`/oratoria/${slug}`);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/oratoria" className="text-sm text-muted hover:text-foreground">
        ← Todos los desafíos
      </Link>
      <div className="mt-4 rounded-lg border border-line bg-surface p-6">
        <span className="text-xs uppercase tracking-wider text-muted tabular-nums">
          Objetivo: {challenge.seconds < 120 ? `${challenge.seconds} segundos` : `${challenge.seconds / 60} minutos`}
        </span>
        <h1 className="mt-1 font-display text-3xl">{challenge.title}</h1>
        <p className="mt-4 text-lg">{challenge.prompt}</p>
        <p className="mt-2 text-sm text-muted">Le hablás a: {challenge.audience}</p>

        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-sm font-semibold">Antes de empezar</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {challenge.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Estructura que casi siempre funciona: una apertura que enganche, dos o tres ideas como máximo y un
            cierre con un pedido o una conclusión clara.
          </p>
        </section>

        <Recorder challenge={{ slug: challenge.slug, seconds: challenge.seconds }} />
      </div>
    </main>
  );
}
