"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { List, LayoutGrid } from "lucide-react";

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
    { base: "/onboarding", label: "Liste", icon: List },
    { base: "/onboarding/matrice", label: "Matrice", icon: LayoutGrid },
  ] as const;

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-zinc-100 border border-zinc-200">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.base;
        return (
          <Link
            key={t.base}
            href={`${t.base}${suffix}`}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all",
              active
                ? "bg-white text-zinc-900 shadow-sm font-medium"
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
