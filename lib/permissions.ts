/**
 * Modèle de rôles & permissions MoonCRM.
 *
 * SOURCE UNIQUE DE VÉRITÉ : un rôle = un jeu de permissions, défini ici en
 * dur (pas en base) → impossible à mal configurer, et trivial à ajuster
 * (modifier le tableau ROLE_PERMISSIONS ci-dessous suffit, ça se propage
 * partout : middleware, server actions, UI).
 *
 * Stockage : la colonne `profiles.role` contient le rôle (cf. migration 0078).
 * `profiles.is_admin` reste synchronisé (= role === 'admin') pour la
 * rétro-compat (RLS + ancien code).
 *
 * Application en 3 couches (défense en profondeur) :
 *   1. middleware  → accès aux pages (routes sensibles)
 *   2. server actions → blocage des mutations (requirePermission)
 *   3. UI → masque/désactive ce qui n'est pas autorisé
 */

export type Role = "admin" | "collaborateur" | "lecture" | "externe";

export type Permission =
  | "manage_users" // page /admin : approuver / gérer les comptes
  | "view_finance" // cockpit Finance (vision dirigeant : CA, MRR, atterrissage)
  | "view_facturation" // page Facturation (consultation)
  | "view_honoraires" // voir les montants clients (ARR, forfaits)
  | "edit_clients" // créer / éditer fiches + pipeline
  | "edit_honoraires" // éditer les montants clients
  | "edit_production" // obligations, missions, échéances, onboarding, pilotage
  | "edit_facturation" // marquer facturé / à facturer
  | "edit_parametrage" // statuts, étiquettes TVA, configuration
  | "use_jarvis"; // chatbot IA

export const ROLES: Role[] = ["admin", "collaborateur", "lecture", "externe"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  collaborateur: "Collaborateur",
  lecture: "Lecture seule",
  externe: "Externe",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Accès complet, y compris la gestion des utilisateurs et la Finance.",
  collaborateur: "Production, clients, pipeline et facturation. Sans Finance, honoraires, paramétrage ni gestion des comptes.",
  lecture: "Consultation seule : voit les dossiers et la production, ne modifie rien. Pas de Finance.",
  externe: "Accès très restreint : production et clients en consultation, sans données financières (honoraires, facturation, Finance).",
};

/**
 * Matrice rôle → permissions. C'EST ICI qu'on ajuste les droits.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "manage_users",
    "view_finance",
    "view_facturation",
    "view_honoraires",
    "edit_clients",
    "edit_honoraires",
    "edit_production",
    "edit_facturation",
    "edit_parametrage",
    "use_jarvis",
  ],
  collaborateur: [
    "view_facturation",
    "view_honoraires",
    "edit_clients",
    "edit_production",
    "edit_facturation",
    "use_jarvis",
  ],
  lecture: ["view_facturation", "view_honoraires"],
  externe: [],
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

/** Normalise une valeur DB (role éventuellement null + is_admin legacy) en Role. */
export function resolveRole(input: { role?: string | null; is_admin?: boolean | null }): Role {
  if (isRole(input.role)) return input.role;
  // Rétro-compat : un ancien compte sans `role` mais is_admin = admin, sinon
  // collaborateur (les comptes approuvés avaient l'accès complet avant les rôles).
  if (input.is_admin) return "admin";
  return "collaborateur";
}

export function hasPermission(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}

export function permissionsFor(role: Role): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}
