import Link from "next/link";
import { requireAdmin } from "@/lib/access";

const TABS = [
  { href: "/admin", label: "Usuarios" },
  { href: "/admin/metricas", label: "Métricas" },
  { href: "/admin/practicas", label: "Prácticas" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Administración</p>
      <nav className="mt-3 flex flex-wrap gap-2 border-b border-line pb-3 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-md border border-line px-3 py-1.5 font-semibold hover:bg-persona"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </main>
  );
}
