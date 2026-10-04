import { NextResponse, type NextRequest } from "next/server";
import { accessFor } from "@/lib/access";
import { createAdmin, getUser } from "@/lib/supabase/server";

const STATUS_BY_ACTION: Record<string, "approved" | "denied"> = {
  approve: "approved",
  deny: "denied",
};

/** Aceptar o denegar una cuenta. Solo el administrador; vuelve al panel. */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user || !(await accessFor(user)).isAdmin) {
    return Response.json({ error: "No autorizado." }, { status: 403 });
  }

  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const status = STATUS_BY_ACTION[String(form.get("action") ?? "")];
  const back = new URL("/admin", request.nextUrl.origin);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !status) {
    back.searchParams.set("error", "1");
    return NextResponse.redirect(back, { status: 303 });
  }

  const { error } = await createAdmin()
    .from("profiles")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error(error);
    back.searchParams.set("error", "1");
  }
  return NextResponse.redirect(back, { status: 303 });
}
