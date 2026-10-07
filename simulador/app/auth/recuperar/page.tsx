"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/practicar";
}

/**
 * Acá vuelven los links de los mails (confirmar cuenta y "olvidé mi contraseña").
 * Supabase manda la sesión en el fragmento (#access_token=…). La guardamos en las cookies
 * y seguimos. Funciona aunque el mail se abra en otro navegador o en el celular.
 */
export default function EmailLinkPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setFailed(true);
      return;
    }

    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error(error);
          setFailed(true);
          return;
        }
        // replace: así el link con los tokens no queda en el historial.
        window.location.replace(next);
      });
  }, []);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      {failed ? (
        <>
          <h1 className="font-display text-3xl">El link no sirve</h1>
          <p className="mt-2 text-muted">
            Venció o ya se usó. Pedí otro mail desde{" "}
            <Link href="/login" className="underline">
              la pantalla de entrada
            </Link>{" "}
            y abrí el último que te llegue.
          </p>
        </>
      ) : (
        <p className="text-muted">Un momento…</p>
      )}
    </main>
  );
}
