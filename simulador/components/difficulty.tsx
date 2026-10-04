const LABELS = ["Fácil", "Media", "Difícil"];

export default function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  const label = LABELS[level - 1];
  return (
    <span className="text-xs uppercase tracking-wider text-muted" aria-label={`Dificultad ${label}`}>
      {"●".repeat(level)}
      <span className="opacity-30">{"●".repeat(3 - level)}</span> {label}
    </span>
  );
}
