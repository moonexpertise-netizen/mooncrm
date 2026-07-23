"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Onglets de la fiche client. Chaque onglet est une sous-route Next.js :
 *   /clients/[slug]            → Identité (page.tsx)
 *   /clients/[slug]/exercice   → Échéances
 *   /clients/[slug]/obligations → Obligations
 *   /clients/[slug]/onboarding → Onboarding
 *
 * Prefetch Next.js actif sur les Link → navigation quasi-instantanée.
 */
export default function FicheTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/clients/${slug}`;

  const tabs = [
    { href: base, label: "Informations", match: (p: string) => p === base },
    { href: `${base}/honoraires`, label: "Honoraires", match: (p: string) => p.startsWith(`${base}/honoraires`) },
    { href: `${base}/obligations`, label: "Obligations", match: (p: string) => p.startsWith(`${base}/obligations`) },
    { href: `${base}/onboarding`, label: "Onboarding", match: (p: string) => p.startsWith(`${base}/onboarding`) },
    { href: `${base}/exercice`, label: "Échéances", match: (p: string) => p.startsWith(`${base}/exercice`) },
    { href: `${base}/temps`, label: "Temps", match: (p: string) => p.startsWith(`${base}/temps`) },
    { href: `${base}/historique`, label: "Historique", match: (p: string) => p.startsWith(`${base}/historique`) },
  ];

  return (
    <nav
      aria-label="Sections du dossier"
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08] overflow-x-auto max-w-full scrollbar-thin"
    >
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={cn(
              // min-h-[44px] : cible tactile mobile WCAG / iOS HIG
              "px-3.5 py-2 min-h-[44px] inline-flex items-center text-sm rounded-lg transition-all whitespace-nowrap shrink-0",
              active
                ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
