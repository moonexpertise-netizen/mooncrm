import type { LDMClientData } from "@/lib/ldm-generator";

/**
 * Colonnes clients nécessaires à une LDM + mapping vers LDMClientData.
 * Partagé entre la génération unitaire (route /ldm) et la génération en masse
 * (route /documents/bulk) pour rester cohérent.
 */
export const LDM_CLIENT_SELECT =
  "denomination, activite, origine, adresse_siege, code_postal, ville, fin_mission_date, honoraires_compta, forfait_pilotage, forfait_bilan, honoraires_jur, honoraires_reprise, honoraires_creation, type_honos_bilans, type_honos_jur, type_honos_creation, type_honos_reprise, tdb_periode, tdb_honos_periode, oss_periode, oss_honos_trimestre, forfait_debut_montant, forfait_debut_date_debut, forfait_debut_condition, forfait_debut_nb_mois, forfait_debut_nb_echeances, forfait_debut_date_fin, forfait_debut_termine, bilan_premier_offert";

// Ligne brute Supabase (types larges : PostgREST renvoie du numeric en string,
// des enums en string). On resserre au mapping.
type Raw = Record<string, unknown>;

export function toLDMClientData(client: Raw): LDMClientData {
  const s = (v: unknown) => (v == null ? null : (v as string));
  const n = (v: unknown) => Number((v as number | string | null) ?? 0);
  return {
    denomination: (client.denomination as string) ?? "",
    activite: s(client.activite),
    origine: s(client.origine),
    adresse_siege: s(client.adresse_siege),
    code_postal: s(client.code_postal),
    ville: s(client.ville),
    fin_mission_date: s(client.fin_mission_date),
    honoraires_compta: n(client.honoraires_compta),
    forfait_pilotage: n(client.forfait_pilotage),
    forfait_bilan: n(client.forfait_bilan),
    honoraires_jur: n(client.honoraires_jur),
    honoraires_reprise: n(client.honoraires_reprise),
    honoraires_creation: n(client.honoraires_creation),
    type_honos_bilans: s(client.type_honos_bilans) as "Inclus" | "Facturés" | null,
    type_honos_jur: s(client.type_honos_jur) as "Facturés" | "Inclus" | "Non souscrit" | null,
    type_honos_creation: s(client.type_honos_creation) as "Facturés" | "Non souscrit" | null,
    type_honos_reprise: s(client.type_honos_reprise) as "Facturés" | "Non souscrit" | null,
    tdb_periode: s(client.tdb_periode) as "Mensuel" | "Trimestriel" | "Non souscrit" | null,
    tdb_honos_periode: n(client.tdb_honos_periode),
    oss_periode: s(client.oss_periode) as "Trimestriel" | "Non souscrit" | null,
    oss_honos_trimestre: n(client.oss_honos_trimestre),
    forfait_debut_montant: n(client.forfait_debut_montant),
    forfait_debut_date_debut: s(client.forfait_debut_date_debut),
    forfait_debut_condition: s(client.forfait_debut_condition) as
      | "Début de facturation"
      | "Nombre de mois"
      | "Date"
      | null,
    forfait_debut_nb_mois: client.forfait_debut_nb_mois == null ? null : Number(client.forfait_debut_nb_mois),
    forfait_debut_nb_echeances:
      client.forfait_debut_nb_echeances == null ? null : Number(client.forfait_debut_nb_echeances),
    forfait_debut_date_fin: s(client.forfait_debut_date_fin),
    forfait_debut_termine: client.forfait_debut_termine === true,
    bilan_premier_offert: client.bilan_premier_offert === true,
  };
}
