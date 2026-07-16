// Types TS reflétant le schéma SQL (manuels en attendant `supabase gen types`).
// À régénérer via : npx supabase gen types typescript --project-id <id> > lib/types/database.gen.ts

export type FormeJuridique =
  | "ASSO" | "SA" | "SCI" | "EI" | "SARL" | "SAS" | "SELARL" | "SELAS"
  | "SCM" | "SC" | "EURL" | "SASU" | "INDIV" | "AARPI" | "LMNP";

/** Activité : texte libre (plus un enum depuis migration 0022). */
export type Activite = string;

export type Origine =
  | "1 - Création"
  | "2 - Reprise"
  | "3 - Reprise sans EC"
  | "4 - Interne"
  | "5 - Sous-traitance";

export type Regime = "IR" | "IS";

export type PipelineStatut =
  | "1 - Rencontre prospect"
  | "2 - PC à préparer"
  | "3 - PC envoyée"
  | "4 - PC acceptée"
  | "5 - Guide + Tally envoyé"
  | "6 - LDM à préparer"
  | "7 - LDM envoyée"
  | "8 - LDM signée"
  | "Z - Interne"
  | "Z - Sous-traitance"
  | "Z - Prospect perdu"
  | "Z - Résiliée"
  | "Z - Perdu dans l'espace";

export type TypeObligation =
  | "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS"
  | "TVS_MENSUELLE" | "TVS_TRIMESTRIELLE"
  | "IS_ACOMPTE" | "IS_SOLDE"
  | "CVAE" | "CVAE_ACOMPTE"
  | "CFE"
  | "DAS2" | "DECL_2561" | "DECL_2777" | "OSS" | "DES"
  | "COMPTA" | "LIASSE_PLAQUETTE" | "AGO_DEPOT" | "DEPOT_COMPTES"
  | "FACTURATION_JUR"
  | "ETAT_CREATION";

export type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export type OnboardingTaskKey =
  | "tally_crea_pdc" | "abo_moon" | "mandat_moon" | "mandat_impots" | "impot_gouv"
  | "cfe_1447" | "acces_pennylane" | "ob_pennylane"
  | "depot_kbis_banque"
  | "confrere"
  | "affiliation_tns" | "option_ir_is" | "previ_tns";

export type OnboardingCategorie = "2G" | "2C" | "2R" | "2T";

export interface Client {
  id: string;
  denomination: string;
  siren: string | null;
  forme: FormeJuridique | null;
  activite: Activite | null;
  email: string | null;
  origine: Origine | null;
  regime: Regime | null;
  jour_cloture: number | null;
  mois_cloture: number | null;
  mois_signature: string | null;
  /** Adresse du siège - pour la LDM. Saisi manuellement, ou auto-fill Pappers (Reprise) / Tally (Création) */
  adresse_siege: string | null;
  code_postal: string | null;
  ville: string | null;
  /** Date de fin de mission (LDM). Si null → 31/12 année courante */
  fin_mission_date: string | null;
  groupe_id: string | null;
  pipeline_statut: PipelineStatut | null;
  note_pdc: string | null;
  ldm_social: string | null;
  honoraires_compta: number;   // Forfait comptable (mensuel)
  forfait_bilan: number;       // Forfait bilan (annuel)
  forfait_pilotage: number;    // Forfait pilotage (mensuel)
  honoraires_jur: number;      // Forfait juridique (annuel)
  honoraires_reprise: number;  // One-shot reprise
  honoraires_creation: number; // One-shot création
  exceptionnel: number;
  type_honos_bilans: "Inclus" | "Facturés" | null;
  type_honos_jur: "Facturés" | "Inclus" | "Non souscrit" | null;
  type_honos_creation: "Facturés" | "Non souscrit" | null;
  type_honos_reprise: "Facturés" | "Non souscrit" | null;
  tdb_periode: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
  tdb_honos_periode: number;
  // Guichet unique - OSS (toujours trimestriel). Cf. migration 0086.
  oss_periode: "Trimestriel" | "Non souscrit" | null;
  oss_honos_trimestre: number;  // montant par trimestre (saisi)
  forfait_oss: number;          // GENERATED · équivalent mensuel (= /3 si Trimestriel)
  // Forfait de début d'activité (1ère année, tarif réduit). Cf. migration 0087.
  // Impact = LDM uniquement (pas le MRR).
  forfait_debut_montant: number;                 // €/mois réduit (0 = pas de forfait début)
  forfait_debut_date_debut: string | null;       // "à compter du" (YYYY-MM-DD)
  forfait_debut_condition: "Début de facturation" | "Nombre de mois" | "Date" | null;
  forfait_debut_nb_mois: number | null;          // si condition = "Nombre de mois"
  forfait_debut_date_fin: string | null;         // si condition = "Date" (YYYY-MM-DD)
  forfait_debut_termine: boolean;                // bouton "rythme de croisière"
  bilan_premier_offert: boolean;                 // 1er bilan offert (LDM + statut facturation)
  mrr: number;                 // GENERATED · compta + pilotage + oss + (bilan + jur)/12
  arr: number;                 // GENERATED · (compta + pilotage + oss) * 12 + bilan + jur
  created_at: string;
  updated_at: string;
}

export interface ObligationSubscription {
  id: string;
  client_id: string;
  type: TypeObligation;
  annee: number;
  note: string | null;
  created_at: string;
}

export interface Obligation {
  id: string;
  subscription_id: string;
  client_id: string;
  type: TypeObligation;
  periode: string;
  annee: number;
  echeance: string | null;
  statut_logique: StatutLogique;
  statut_detail: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingTask {
  id: string;
  client_id: string;
  task_key: OnboardingTaskKey;
  categorie: OnboardingCategorie;
  statut_logique: StatutLogique;
  statut_detail: string | null;
  note: string | null;
  updated_at: string;
}

export interface StatusOption {
  id: string;
  scope: "obligation" | "onboarding";
  type_code: string;
  libelle: string;
  statut_logique: StatutLogique;
  ordre: number;
  actif: boolean;
}
