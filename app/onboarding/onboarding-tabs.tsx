"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { List, LayoutGrid } from "lucide-react";

/**
 * Sélecteur d'onglet onboarding (Liste / Matrice).
 *
 * Style minimaliste type "segmented control", inspiré de la nav d'onglets
 * existante sur la fiche client.
 */
export default function OnboardingTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/onboarding", label: "Liste", icon: List },
    { href: "/onboarding/matrice", label: "Matrice", icon: LayoutGrid },
  ] as const;

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-zinc-100 border border-zinc-200">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
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
