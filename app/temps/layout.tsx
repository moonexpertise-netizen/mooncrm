"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/temps", label: "Saisie", exact: true },
  { href: "/temps/planning", label: "Planning", exact: false },
];

export default function TempsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Temps
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Feuille de temps et planning de l&apos;équipe.
        </p>
      </div>
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-white/[0.08]">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-[hsl(var(--gold))] text-zinc-900 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
