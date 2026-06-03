/**
 * Loaders mémoïsés pour la fiche client.
 *
 * React `cache()` dédoublonne les appels à l'intérieur d'un même request,
 * donc le layout + chaque sous-route peuvent appeler `loadClient(slug)` sans
 * surcoût (1 seule query Postgres). Indispensable depuis qu'on a éclaté la
 * fiche en sous-routes (identité, exercice, obligations, onboarding).
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const CLIENT_SELECT =
  "id, denomination, siren, slug, forme, activite, regime, pipeline_statut, mrr, arr, email, fin_mission_date, adresse_siege, code_postal, ville, jour_cloture, mois_cloture, debut_obligations, mois_signature, origine, gestion_tns, honoraires_compta, type_honos_bilans, forfait_bilan, type_honos_jur, honoraires_jur, tdb_periode, tdb_honos_periode, forfait_pilotage, type_honos_creation, honoraires_creation, type_honos_reprise, honoraires_reprise, exceptionnel, note_pdc, ldm_social, tva_tag_id, tva_echeance_jour, tdb_livraison_periode, rdv_expert_periode, groupes(nom)";

// Fallback sans les 2 colonnes pilotage (migration 0060). Permet a la fiche
// client de rester chargeable meme si la migration n'a pas encore ete
// appliquee en prod -> evite l'error boundary "Impossible de charger".
const CLIENT_SELECT_FALLBACK =
  "id, denomination, siren, slug, forme, activite, regime, pipeline_statut, mrr, arr, email, fin_mission_date, adresse_siege, code_postal, ville, jour_cloture, mois_cloture, debut_obligations, mois_signature, origine, gestion_tns, honoraires_compta, type_honos_bilans, forfait_bilan, type_honos_jur, honoraires_jur, tdb_periode, tdb_honos_periode, forfait_pilotage, type_honos_creation, honoraires_creation, type_honos_reprise, honoraires_reprise, exceptionnel, note_pdc, ldm_social, tva_tag_id, tva_echeance_jour, groupes(nom)";

export const loadClient = cache(async (slug: string) => {
  const sb = await createClient();
  const r1 = await sb
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (!r1.error) return r1.data;
  // Fallback : si une colonne pilotage manque (migration 0060 pas appliquee),
  // on re-tente sans -> la fiche reste accessible (TdB/RDV apparaitront NULL).
  const r2 = await sb
    .from("clients")
    .select(CLIENT_SELECT_FALLBACK)
    .eq("slug", slug)
    .maybeSingle();
  return r2.data;
});

export const loadContactsLink = cache(async (clientId: string) => {
  const sb = await createClient();
  const { data } = await sb
    .from("client_contacts")
    .select("role, contacts(id, nom, prenom, email, telephone, civilite)")
    .eq("client_id", clientId);
  return data ?? [];
});

export const loadAllStatusOpts = cache(async () => {
  const sb = await createClient();
  const { data } = await sb
    .from("status_options")
    .select("type_code, libelle, color")
    .eq("scope", "obligation");
  return data ?? [];
});

/**
 * Charge les etiquettes TVA actives + l'unique tag eventuellement deja affecte
 * au client courant meme s'il est inactif (sinon on perdrait l'affichage).
 */
export const loadActiveTvaTags = cache(async (currentTagId?: string | null) => {
  const sb = await createClient();
  const { data } = await sb
    .from("tva_tags")
    .select("id, label, color, actif")
    .or(currentTagId ? `actif.eq.true,id.eq.${currentTagId}` : `actif.eq.true`)
    .order("ordre");
  return (data ?? []) as Array<{ id: string; label: string; color: string; actif: boolean }>;
});

export type DirigeantContact = {
  id: string;
  nom: string;
  prenom: string | null;
  civilite: "M." | "Mme" | "Mlle" | null;
  email: string | null;
  telephone: string | null;
};

export function extractDirigeant(
  contactsLink: Array<{ role: string | null; contacts: unknown }>
): DirigeantContact | null {
  const c = (contactsLink?.[0]?.contacts as unknown as DirigeantContact | null) ?? null;
  return c;
}
