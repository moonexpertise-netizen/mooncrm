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
    { href: base, label: "Identité", match: (p: string) => p === base },
    { href: `${base}/exercice`, label: "Échéances", match: (p: string) => p.startsWith(`${base}/exercice`) },
    { href: `${base}/obligations`, label: "Obligations", match: (p: string) => p.startsWith(`${base}/obligations`) },
    { href: `${base}/onboarding`, label: "Onboarding", match: (p: string) => p.startsWith(`${base}/onboarding`) },
  ];

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 border border-zinc-200/60 overflow-x-auto max-w-full scrollbar-thin">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch
            className={cn(
              "px-3.5 py-1.5 text-sm rounded-lg transition-all whitespace-nowrap shrink-0",
              active
                ? "bg-white text-zinc-900 shadow-card font-medium"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
