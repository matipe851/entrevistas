import { notFound, redirect } from "next/navigation";
import { getScenario, toPublic } from "@/lib/scenarios";
import { getOwnSession, getTurns } from "@/lib/sessions";
import { requireApproved } from "@/lib/access";
import Chat from "./chat";

export default async function SessionPage(props: PageProps<"/sesion/[id]">) {
  const { id } = await props.params;
  const user = await requireApproved(`/sesion/${id}`);
  const session = await getOwnSession(id, user.id);
  const scenario = session && getScenario(session.scenario_slug);
  if (!session || !scenario) notFound();
  if (session.status === "finished") redirect(`/sesion/${id}/resultado`);

  const turns = await getTurns(id);
  return <Chat sessionId={id} scenario={toPublic(scenario)} initialTurns={turns} />;
}
