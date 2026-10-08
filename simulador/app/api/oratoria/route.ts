import { ApiError } from "@google/genai";
import { logAiError } from "@/lib/ai";
import { startOfTodayAR } from "@/lib/limits";
import { analyzeSpeech, DAILY_SPEECHES, getChallenge } from "@/lib/oratoria";
import { approvedOrError } from "@/lib/access";
import { createAdmin } from "@/lib/supabase/server";

/** Analizar un audio puede tardar más que una charla. */
export const maxDuration = 60;

/** Vercel acepta cuerpos de hasta 4,5 MB: el audio llega en WAV de 12 kHz y hasta 150 segundos. */
const MAX_AUDIO_BYTES = 4_000_000;
const MAX_TEXT_CHARS = 3000;
const MIN_TEXT_CHARS = 40;

export async function POST(request: Request) {
  const gate = await approvedOrError();
  if ("response" in gate) return gate.response;
  const user = gate.access;

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const challenge = getChallenge(String(form.get("challenge") ?? ""));
  if (!challenge) return Response.json({ error: "Ese desafío no existe." }, { status: 400 });
  const mode = form.get("mode") === "audio" ? "audio" : "texto";

  const admin = createAdmin();
  if (!user.isAdmin) {
    const { count, error } = await admin
      .from("speech_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfTodayAR());
    if (error) {
      console.error(error);
      return Response.json({ error: "No pudimos analizar tu intento. Probá de nuevo." }, { status: 500 });
    }
    if ((count ?? 0) >= DAILY_SPEECHES) {
      return Response.json(
        { error: `Ya hiciste tus ${DAILY_SPEECHES} intentos de hoy. Volvé mañana.` },
        { status: 429 },
      );
    }
  }

  let input: Parameters<typeof analyzeSpeech>[1];
  let duration: number | null = null;
  if (mode === "audio") {
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return Response.json({ error: "No llegó el audio. Probá grabar de nuevo." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "El audio es demasiado largo." }, { status: 413 });
    }
    const seconds = Number(form.get("duration"));
    duration = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
    input = {
      mode: "audio",
      audioBase64: Buffer.from(await audio.arrayBuffer()).toString("base64"),
      mimeType: audio.type || "audio/wav",
    };
  } else {
    const text = String(form.get("text") ?? "").trim();
    if (text.length < MIN_TEXT_CHARS || text.length > MAX_TEXT_CHARS) {
      return Response.json(
        { error: `Escribí entre ${MIN_TEXT_CHARS} y ${MAX_TEXT_CHARS} caracteres.` },
        { status: 400 },
      );
    }
    input = { mode: "texto", text };
  }

  let analysis;
  try {
    analysis = await analyzeSpeech(challenge, input, duration);
  } catch (error) {
    logAiError(error);
    if (error instanceof ApiError && error.status === 429) {
      return Response.json(
        { error: "Se agotó la cuota gratuita de la IA por ahora. Probá de nuevo en un rato." },
        { status: 429 },
      );
    }
    return Response.json({ error: "No pudimos analizar tu intento. Probá de nuevo." }, { status: 502 });
  }

  const { data, error } = await admin
    .from("speech_attempts")
    .insert({
      user_id: user.id,
      challenge_slug: challenge.slug,
      mode,
      duration_seconds: analysis.durationSeconds,
      transcript: analysis.transcript,
      result: analysis.result,
    })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    return Response.json({ error: "No pudimos guardar el análisis." }, { status: 500 });
  }
  return Response.json({ id: data.id as string });
}
