import { redirect } from "next/navigation";
import { accessFor } from "@/lib/access";
import { requireUser } from "@/lib/supabase/server";

export default async function PendingPage() {
  const access = await accessFor(await requireUser("/pendiente"));
  if (access.status === "approved") redirect("/practicar");
  const denied = access.status === "denied";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="font-display text-3xl">{denied ? "Tu cuenta no fue habilitada" : "Tu cuenta está en revisión"}</h1>
      <p className="mt-3 text-muted">
        {denied
          ? "Por ahora no podés usar Ensayo con esta cuenta. Si creés que es un error, escribile al administrador."
          : `Ya te registraste como ${access.email ?? "usuario"}. Cuando el administrador apruebe tu cuenta vas a poder practicar. Volvé a entrar más tarde.`}
      </p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button type="submit" className="rounded-md border border-line px-4 py-2 font-semibold">
          Salir
        </button>
      </form>
    </main>
  );
}
