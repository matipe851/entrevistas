import { notFound } from "next/navigation";
import { getScenario, scenarios } from "@/lib/scenarios";
import Chat from "./chat";

export function generateStaticParams() {
  return scenarios.map((s) => ({ slug: s.slug }));
}

export default async function PracticePage(props: PageProps<"/practicar/[slug]">) {
  const { slug } = await props.params;
  const scenario = getScenario(slug);
  if (!scenario) notFound();
  return <Chat scenario={scenario} />;
}
