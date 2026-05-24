"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

type TabKey = "identite" | "exercice" | "obligations" | "onboarding";

/**
 * Wrapper client : les 4 panneaux sont déjà rendus côté serveur et passés
 * comme React.ReactNode. On switch côté client sans aucun aller-retour réseau.
 * L'URL est mise à jour en `replaceState` (shallow) pour conserver l'état
 * du tab dans l'historique sans déclencher de navigation Next.
 */
export default function FicheTabs({
  clientId,
  defaultTab,
  selectedYear,
  identite,
  exercice,
  obligations,
  onboarding,
}: {
  clientId: string;
  defaultTab: TabKey;
  selectedYear: number;
  identite: React.ReactNode;
  exercice: React.ReactNode;
  obligations: React.ReactNode;
  onboarding: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>(defaultTab);

  function changeTab(k: TabKey) {
    setActive(k);
    // Mise à jour URL sans navigation (instantané). On part de l'URL actuelle
    // pour CONSERVER les params nav-* (filtre actif) + tout le reste, et on
    // remplace juste `tab` et `year`.
    const params = new URLSearchParams(window.location.search);
    params.delete("tab");
    params.delete("year");
    if (k === "exercice") {
      params.set("tab", "exercice");
      params.set("year", String(selectedYear));
    } else if (k !== "identite") {
      params.set("tab", k);
    }
    const qs = params.toString();
    const newUrl = `/clients/${clientId}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }

  // Note : la clé "exercice" reste dans l'URL (compat) — seul le LABEL change.
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "identite", label: "Identité" },
    { key: "exercice", label: "Échéances" },
    { key: "obligations", label: "Obligations" },
    { key: "onboarding", label: "Onboarding" },
  ];

  return (
    <>
      <div className="border-b flex gap-1">
        {tabs.map((t) => {
          // L'onglet Exercice nécessite l'année dans l'URL pour le YearSwitcher
          // et le re-fetch quand on change d'année. On garde donc un Link réel
          // si on n'est pas déjà sur Exercice — sinon switch instantané.
          const href =
            t.key === "exercice"
              ? `/clients/${clientId}?tab=exercice&year=${selectedYear}`
              : t.key === "identite"
              ? `/clients/${clientId}`
              : `/clients/${clientId}?tab=${t.key}`;
          // Si on switch entre des tabs déjà rendus (tous le sont), on évite
          // la navigation Next via onClick.
          return (
            <Link
              key={t.key}
              href={href}
              prefetch
              onClick={(e) => {
                e.preventDefault();
                changeTab(t.key);
              }}
              className={cn(
                "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
                t.key === active
                  ? "border-[hsl(var(--gold))] text-[hsl(var(--gold-dark))] font-medium"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className={cn(active === "identite" ? "block" : "hidden")}>
        {identite}
      </div>
      <div className={cn(active === "exercice" ? "block" : "hidden")}>
        {exercice}
      </div>
      <div className={cn(active === "obligations" ? "block" : "hidden")}>
        {obligations}
      </div>
      <div className={cn(active === "onboarding" ? "block" : "hidden")}>
        {onboarding}
      </div>
    </>
  );
}
