"use client";

import { useEffect, useState } from "react";

/**
 * Hook de persistance d'une preference utilisateur dans localStorage.
 *
 * Pattern partage sur toute l'app pour les filtres de tracker / table :
 * conserve la selection apres un reload (vue annee, filtre statut,
 * filtre periode, tri, etc.).
 *
 * SSR-safe :
 *   - Au premier render (SSR + client mount), retourne `initial`
 *   - Apres l'hydratation, lit la valeur stockee (si valide selon `parse`)
 *   - Toute mutation est ecrite dans localStorage
 *
 * Utilisation :
 *   const [view, setView] = useLocalStoragePref<"3m" | "12m">(
 *     "moon.tracker.tva.view",
 *     "12m",
 *     (raw) => (raw === "3m" || raw === "12m" ? raw : null),
 *   );
 *
 * Pour les Set<T> :
 *   const [filter, setFilter] = useLocalStoragePref<Set<StatusGroup>>(
 *     "moon.ir.statusFilter",
 *     new Set(),
 *     (raw) => {
 *       try { const arr = JSON.parse(raw); return Array.isArray(arr) ? new Set(arr) : null; }
 *       catch { return null; }
 *     },
 *     (val) => JSON.stringify(Array.from(val)),
 *   );
 *
 * Limites :
 *   - Pas d'invalidation cross-tab (storage event ignore - pas necessaire pour
 *     un CRM mono-onglet en pratique).
 *   - `parse` est appele a chaque mount : si la cle est invalide / corrompue,
 *     retourne null -> on retombe sur `initial`.
 */
export function useLocalStoragePref<T>(
  key: string,
  initial: T,
  /** Parse la string brute du localStorage. Retourne null si invalide. */
  parse: (raw: string) => T | null,
  /** Sérialise la valeur. Defaut : JSON.stringify. */
  serialize: (val: T) => string = (val) => JSON.stringify(val)
): [T, (val: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Read au mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = parse(raw);
        if (parsed !== null) setValue(parsed);
      }
    } catch {
      // localStorage indispo (mode prive, quota) - on garde initial
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write a chaque changement (apres hydratation pour ne pas ecraser la valeur
  // stockee avec le defaut au premier render).
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // quota plein / mode prive
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, hydrated]);

  return [value, setValue];
}

/**
 * Helper specialise pour les Set<string> stockees en localStorage.
 * Encapsule le pattern JSON.parse -> Array -> Set + reverse.
 */
export function useLocalStorageSet<T extends string>(
  key: string,
  initial: Set<T> = new Set(),
  /** Validateur optionnel : si fourni, filtre les keys invalides au load. */
  isValidKey?: (k: string) => k is T
): [Set<T>, (val: Set<T> | ((prev: Set<T>) => Set<T>)) => void] {
  return useLocalStoragePref<Set<T>>(
    key,
    initial,
    (raw) => {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return null;
        const filtered = isValidKey ? arr.filter(isValidKey) : (arr as T[]);
        return new Set(filtered);
      } catch {
        return null;
      }
    },
    (set) => JSON.stringify(Array.from(set))
  );
}
