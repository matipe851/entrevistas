"use client";

import { track } from "@vercel/analytics";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Mode = "audio" | "texto";
type Recording = { wav: Blob; url: string; seconds: number };

/** WAV mono de 12 kHz: lo entiende Gemini y 150 segundos entran en el límite de Vercel (4,5 MB). */
const SAMPLE_RATE = 12_000;
/** Margen para pasarse del tiempo objetivo antes de cortar la grabación. */
const EXTRA_SECONDS = 30;

/** Convierte lo que grabó el navegador (webm, mp4, ogg) a WAV PCM de 16 bits. */
async function toWav(blob: Blob): Promise<{ wav: Blob; seconds: number }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer()).finally(() => void ctx.close());
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return { wav: new Blob([buffer], { type: "audio/wav" }), seconds: decoded.duration };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Recorder({ challenge }: { challenge: { slug: string; seconds: number } }) {
  const router = useRouter();
  const maxSeconds = challenge.seconds + EXTRA_SECONDS;
  const [mode, setMode] = useState<Mode>("audio");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Recording | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(0);

  function cleanup() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => cleanup(), []);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function start() {
    setError(null);
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Tu navegador no permite grabar audio. Probá con Chrome o escribí tu intervención.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("No pudimos usar el micrófono. Revisá el permiso del navegador o escribí tu intervención.");
      return;
    }
    streamRef.current = stream;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      cleanup();
      setRecording(false);
      setBusy(true);
      try {
        const { wav, seconds } = await toWav(new Blob(chunks, { type: recorder.mimeType }));
        setResult({ wav, url: URL.createObjectURL(wav), seconds });
      } catch (err) {
        console.error(err);
        setError("No pudimos procesar la grabación. Probá de nuevo.");
      } finally {
        setBusy(false);
      }
    };
    recorder.start();
    startedRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      const secs = (Date.now() - startedRef.current) / 1000;
      setElapsed(secs);
      if (secs >= maxSeconds && recorder.state === "recording") recorder.stop();
    }, 250);
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("challenge", challenge.slug);
    form.set("mode", mode);
    if (mode === "audio") {
      if (!result) return setBusy(false);
      form.set("audio", result.wav, "intento.wav");
      form.set("duration", String(Math.round(result.seconds)));
    } else {
      form.set("text", text);
    }
    const res = await fetch("/api/oratoria", { method: "POST", body: form }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res?.ok || !data?.id) {
      setError(data?.error ?? "No pudimos analizar tu intento. Probá de nuevo.");
      setBusy(false);
      return;
    }
    track("oratoria_intento", { desafio: challenge.slug, modo: mode });
    router.push(`/oratoria/intento/${data.id}`);
  }

  const over = elapsed > challenge.seconds;
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      disabled={recording || busy}
      aria-pressed={mode === m}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
        mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mt-6 border-t border-line pt-5">
      <div className="inline-flex gap-1 rounded-lg border border-line bg-background p-1">
        {tab("audio", "Grabar audio")}
        {tab("texto", "Escribir")}
      </div>

      {mode === "audio" ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className={`font-semibold tabular-nums ${over ? "text-red-700 dark:text-red-400" : ""}`}>
              {fmt(recording ? elapsed : (result?.seconds ?? 0))}
            </span>
            <span className="text-muted tabular-nums">Objetivo {fmt(challenge.seconds)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-persona">
            <div
              className={`h-full ${over ? "bg-red-600" : "bg-accent"}`}
              style={{
                width: `${Math.min(100, ((recording ? elapsed : (result?.seconds ?? 0)) / challenge.seconds) * 100)}%`,
              }}
            />
          </div>
          {recording && over && (
            <p className="mt-1 text-xs text-muted">Te pasaste del tiempo. La grabación se corta sola en {fmt(maxSeconds)}.</p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {!recording ? (
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="rounded-md border border-line px-5 py-2.5 font-semibold disabled:opacity-40"
              >
                {result ? "Grabar de nuevo" : "● Empezar a grabar"}
              </button>
            ) : (
              <button type="button" onClick={stop} className="rounded-md bg-red-600 px-5 py-2.5 font-semibold text-white">
                ■ Terminar
              </button>
            )}
            {result && !recording && (
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
              >
                {busy ? "Analizando… (puede tardar 20 segundos)" : "Analizar mi intervención"}
              </button>
            )}
          </div>
          {result && !recording && (
            <audio controls src={result.url} className="mt-4 w-full">
              Tu navegador no puede reproducir el audio.
            </audio>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="speech" className="text-sm font-semibold">
            Escribí lo que dirías, tal como lo dirías en voz alta
          </label>
          <textarea
            id="speech"
            rows={8}
            maxLength={3000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-2 w-full rounded-md border border-line bg-background px-3 py-2 focus:outline-2 focus:outline-accent"
          />
          <p className="mt-1 text-xs text-muted tabular-nums">
            {text.trim().split(/\s+/).filter(Boolean).length} palabras · leído en voz alta, unos{" "}
            {fmt(Math.round((text.trim().split(/\s+/).filter(Boolean).length / 150) * 60))}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={busy || text.trim().length < 40}
            className="mt-3 rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
          >
            {busy ? "Analizando…" : "Analizar mi intervención"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
