import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import LoginForm from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/practicar";
  if (await getUser()) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/practicar");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="font-display text-3xl">Entrar a Ensayo</h1>
      <p className="mt-2 text-muted">Entrá con tu email y tu contraseña.</p>
      {params.error === "link" && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          El link venció o ya se usó. Si estabas recuperando tu contraseña, pedí otro mail.
        </p>
      )}
      <LoginForm next={next} />
    </main>
  );
}
