"use client";

import { useEffect, useState } from "react";

/**
 * Filtres de la saisie des temps, PARTAGÉS entre les onglets « Saisie » et
 * « Planning » (persistés en localStorage). Régler un filtre sur un onglet le
 * conserve sur l'autre.
 *
 * - q        : recherche texte
 * - dossier  : "" = tous, "__autre" = hors dossier, sinon client_id
 * - activite : "" = toutes, sinon activite_id
 * - collab   : "" = tous (utilisé seulement sur le Planning)
 */
const KEY = "moon.temps.filters";

export type TempsFilters = {
  q: string;
  dossier: string;
  activite: string;
  collab: string;
};

const EMPTY: TempsFilters = { q: "", dossier: "", activite: "", collab: "" };

export function useTempsFilters() {
  const [f, setF] = useState<TempsFilters>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Charge depuis localStorage au montage (évite le mismatch d'hydratation).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setF({ ...EMPTY, ...(JSON.parse(raw) as Partial<TempsFilters>) });
    } catch {
      // localStorage inaccessible / JSON invalide -> on garde les défauts.
    }
    setHydrated(true);
  }, []);

  // Persiste à chaque changement (une fois hydraté).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(f));
    } catch {
      // ignore
    }
  }, [f, hydrated]);

  function set(patch: Partial<TempsFilters>) {
    setF((prev) => ({ ...prev, ...patch }));
  }
  function reset() {
    setF(EMPTY);
  }

  return { ...f, set, reset, hydrated };
}
