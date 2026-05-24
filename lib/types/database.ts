// Types TS reflétant le schéma SQL (manuels en attendant `supabase gen types`).
// À régénérer via : npx supabase gen types typescript --project-id <id> > lib/types/database.gen.ts

export type FormeJuridique =
  | "ASSO" | "SA" | "SCI" | "EI" | "SARL" | "SAS" | "SELARL" | "SELAS"
  | "SCM" | "SC" | "EURL" | "SASU" | "INDIV" | "AARPI" | "LMNP";

/** Activité : texte libre (plus un enum depuis migration 0022). */
export type Activite = string;

export type Origine =
  | "1 - Création"
  | "2 - Création par Tiers"
  | "3 - Reprise"
  | "4 - Reprise sans EC"
  | "Z - Sous-traitance";

export type Regime = "IR" | "IS";

export type PipelineStatut =
  | "1 - Tally à envoyer"
  | "2 - Tally à compléter"
  | "3 - PC à préparer"
  | "4 - PC envoyée"
  | "5 - PC acceptée"
  | "6 - LDM envoyée"
  | "7 - LDM signée"
  | "Z - Interne"
  | "Z - Prospect perdu"
  | "Z - Résiliée";

export type VitesseTva =
  | "1 - Express"
  | "2 - Traitement + long"
  | "3 - Tableau de bord";

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
  | "confrere" | "reprise_compta"
  | "affiliation_tns" | "option_ir_is" | "previ_tns";

export type OnboardingCategorie = "2G" | "2C" | "2R" | "2T";

export interface Client {
  id: string;
  denomination: string;
  siren: string | null;
  pappers_url: string | null;
  inpi_url: string | null;
  forme: FormeJuridique | null;
  activite: Activite | null;
  email: string | null;
  origine: Origine | null;
  regime: Regime | null;
  jour_cloture: number | null;
  mois_cloture: number | null;
  mois_signature: string | null;
  /** Adresse du siège — pour la LDM. Saisi manuellement, ou auto-fill Pappers (Reprise) / Tally (Création) */
  adresse_siege: string | null;
  code_postal: string | null;
  ville: string | null;
  /** Date de fin de mission (LDM). Si null → 31/12 année courante */
  fin_mission_date: string | null;
  collaborateur_id: string | null;
  groupe_id: string | null;
  pipeline_statut: PipelineStatut | null;
  vitesse_tva: VitesseTva | null;
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
  tdb_periode: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
  tdb_honos_periode: number;
  mrr: number;                 // GENERATED · compta + pilotage + (bilan + jur)/12
  arr: number;                 // GENERATED · (compta + pilotage) * 12 + bilan + jur
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
