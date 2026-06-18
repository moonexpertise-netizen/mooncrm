"use client";

import { createContext, useContext, useMemo } from "react";
import type { Permission } from "@/lib/permissions";

/**
 * Contexte des droits EFFECTIFS de l'utilisateur courant, exposé à tous les
 * composants client.
 *
 * Alimenté UNE fois côté serveur (layout racine → getMyPermissions), donc
 * connu dès le premier rendu : pas de flash "contrôle actif → grisé".
 *
 * Usage dans un composant client :
 *   const canEdit = useCan("edit_production");
 *   <Picker disabled={!canEdit} ... />
 *
 * Rappel : ce n'est que du CONFORT visuel. La vraie barrière est côté serveur
 * (requirePermission dans les server actions). Un read-only qui forcerait un
 * clic se ferait refuser par le serveur de toute façon.
 */

const PermissionsContext = createContext<ReadonlySet<Permission>>(new Set());

export function PermissionsProvider({
  perms,
  children,
}: {
  perms: Permission[];
  children: React.ReactNode;
}) {
  // perms est un nouveau tableau à chaque rendu serveur ; on le fige en Set.
  const set = useMemo<ReadonlySet<Permission>>(() => new Set(perms), [perms]);
  return (
    <PermissionsContext.Provider value={set}>
      {children}
    </PermissionsContext.Provider>
  );
}

/** Set complet des permissions effectives (pour les cas avancés). */
export function usePermissions(): ReadonlySet<Permission> {
  return useContext(PermissionsContext);
}

/** True si l'utilisateur courant a la permission donnée. */
export function useCan(perm: Permission): boolean {
  return useContext(PermissionsContext).has(perm);
}
