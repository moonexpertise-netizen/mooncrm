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
    <div className="border-b flex gap-1">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch
            className={cn(
              "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
              active
                ? "border-[hsl(var(--gold))] text-[hsl(var(--gold-dark))] font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
