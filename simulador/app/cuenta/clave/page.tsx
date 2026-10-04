import { requireUser } from "@/lib/supabase/server";
import PasswordForm from "./password-form";

export default async function NewPasswordPage() {
  const user = await requireUser("/cuenta/clave");
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="font-display text-3xl">Elegí tu contraseña</h1>
      <p className="mt-2 text-muted">Para {user.email ?? "tu cuenta"}. La vas a usar para entrar de acá en adelante.</p>
      <PasswordForm />
    </main>
  );
}
