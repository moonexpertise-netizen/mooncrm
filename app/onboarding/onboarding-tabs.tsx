"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { List, LayoutGrid, Settings } from "lucide-react";

/**
 * Sélecteur d'onglet onboarding (Liste / Matrice).
 *
 * Préserve les query params (filtres) au switch d'onglet : c'est ce qui
 * permet aux filtres de "survivre" quand on passe de Liste à Matrice et
 * inversement. Quand on clique "Onboarding" dans la sidebar (URL sans
 * params), les filtres repartent à zéro.
 */
export default function OnboardingTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  const tabs = [
    { base: "/onboarding", label: "Liste", icon: List, preserveParams: true },
    { base: "/onboarding/matrice", label: "Matrice", icon: LayoutGrid, preserveParams: true },
    // Le paramétrage est une vue indépendante, pas de filtres à propager
    { base: "/onboarding/parametrage", label: "Paramétrage", icon: Settings, preserveParams: false },
  ] as const;

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 border border-zinc-200/60">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.base;
        const href = t.preserveParams ? `${t.base}${suffix}` : t.base;
        return (
          <Link
            key={t.base}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all",
              active
                ? "bg-white text-zinc-900 shadow-card font-medium"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50"
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
