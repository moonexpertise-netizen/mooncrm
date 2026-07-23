/**
 * Génère une LDM .docx à partir d'un template docxtemplater et des données client.
 * Templates dans lib/templates/ldm-{presentation,bnc}.docx.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  phraseConformite,
  phraseHonosBilan,
  phraseHonosCreation,
  phraseJuridique,
  phraseReprise,
  phraseTdb,
  phraseOss,
  type LDMContext,
} from "./ldm-phrases";

export type LDMTemplateKey = "presentation" | "bnc" | "sociale";

const TEMPLATE_FILES: Record<LDMTemplateKey, string> = {
  presentation: "ldm-presentation.docx",
  bnc: "ldm-bnc.docx",
  // LDM sociale (gestion de la paie) : seuls l'identité et l'adresse sont
  // personnalisées ({Cher}/{Titre}/{Prenom}/{Nom}/{Societe}/{Adresse_Siege}/
  // {Code_postal}/{Ville}) — les honoraires du tableau restent fixes.
  sociale: "ldm-sociale.docx",
};

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function fmtNumFr(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    Math.round(n)
  );
}

export type LDMClientData = {
  denomination: string;
  activite: string | null;
  origine: string | null;
  adresse_siege: string | null;
  code_postal: string | null;
  ville: string | null;
  fin_mission_date: string | null;        // YYYY-MM-DD
  honoraires_compta: number;              // mensuel
  forfait_pilotage: number;               // mensuel
  forfait_bilan: number;                  // annuel
  honoraires_jur: number;                 // annuel
  honoraires_reprise: number;             // one-shot
  honoraires_creation: number;            // one-shot
  type_honos_bilans: "Inclus" | "Facturés" | null;
  type_honos_jur: "Facturés" | "Inclus" | "Non souscrit" | null;
  type_honos_creation: "Facturés" | "Non souscrit" | null;
  type_honos_reprise: "Facturés" | "Non souscrit" | null;
  tdb_periode: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
  tdb_honos_periode: number;
  oss_periode: "Trimestriel" | "Non souscrit" | null;   // Guichet unique - OSS
  oss_honos_trimestre: number;                           // montant par trimestre
  // Forfait de début d'activité + bilan 1ère année offert (impact LDM).
  forfait_debut_montant: number;
  forfait_debut_date_debut: string | null;
  forfait_debut_condition: "Début de facturation" | "Nombre de mois" | "Date" | null;
  forfait_debut_nb_mois: number | null;
  forfait_debut_nb_echeances: number | null;
  forfait_debut_date_fin: string | null;
  forfait_debut_termine: boolean;
  bilan_premier_offert: boolean;
};

export type LDMDirigeantData = {
  civilite: string | null;                // "M." | "Mme" | "Mlle"
  prenom: string | null;
  nom: string | null;
};

/**
 * Calcule toutes les valeurs à injecter dans le template, dérive les phrases
 * conditionnelles, retourne le bloc { Société, Activité, ... }.
 */
function buildPayload(client: LDMClientData, dirigeant: LDMDirigeantData) {
  // Date de fin de mission : explicite OU 31/12 année courante
  const finDate = client.fin_mission_date
    ? new Date(client.fin_mission_date)
    : new Date(new Date().getFullYear(), 11, 31);
  const cloture_mois = MONTHS_FR[finDate.getMonth()];
  const cloture_annee = String(finDate.getFullYear());

  // Honoraires mensuels = compta + pilotage (utile pour la phrase bilan
  // facturée à honos_mensuels × 2)
  const honos_mensuels = client.honoraires_compta + client.forfait_pilotage;

  const ctx: LDMContext = {
    type_honos_bilans: client.type_honos_bilans,
    type_honos_jur: client.type_honos_jur,
    type_honos_creation: client.type_honos_creation,
    type_honos_reprise: client.type_honos_reprise,
    tdb_periode: client.tdb_periode,
    tdb_honos_periode: client.tdb_honos_periode,
    oss_periode: client.oss_periode,
    oss_honos_trimestre: client.oss_honos_trimestre,
    forfait_debut_montant: client.forfait_debut_montant,
    forfait_debut_date_debut: client.forfait_debut_date_debut,
    forfait_debut_condition: client.forfait_debut_condition,
    forfait_debut_nb_mois: client.forfait_debut_nb_mois,
    forfait_debut_nb_echeances: client.forfait_debut_nb_echeances,
    forfait_debut_date_fin: client.forfait_debut_date_fin,
    forfait_debut_termine: client.forfait_debut_termine,
    bilan_premier_offert: client.bilan_premier_offert,
    forfait_bilan: client.forfait_bilan,
    honoraires_jur: client.honoraires_jur,
    honoraires_reprise: client.honoraires_reprise,
    honoraires_creation: client.honoraires_creation,
    forfait_pilotage: client.forfait_pilotage,
    honos_mensuels: honos_mensuels,
  };

  // Salutation dynamique : "Cher" si dirigeant masculin (M.), "Chère" sinon
  // (Mme / Mlle). null par défaut → "Cher" (cas le plus courant).
  const cher = dirigeant.civilite === "Mme" || dirigeant.civilite === "Mlle"
    ? "Chère"
    : "Cher";

  // Le template Word contient un champ IF qui teste {Titre} = "Monsieur" et
  // renvoie "Cher" ou "Chère". Pour que ce IF évalue correctement, on doit
  // passer le titre LONG ("Monsieur"/"Madame"/"Mademoiselle"), pas l'abrégé.
  const titreLong = dirigeant.civilite === "Mme"
    ? "Madame"
    : dirigeant.civilite === "Mlle"
    ? "Mademoiselle"
    : dirigeant.civilite === "M."
    ? "Monsieur"
    : "";

  return {
    Cher: cher,
    Titre: titreLong,
    Prenom: dirigeant.prenom ?? "",
    Nom: dirigeant.nom ?? "",
    Societe: client.denomination,
    Activite: client.activite ?? "",
    Adresse_Siege: client.adresse_siege ?? "",
    Code_postal: client.code_postal ?? "",
    Ville: client.ville ?? "",
    Cloture_mission_mois: cloture_mois,
    Cloture_mission_annee: cloture_annee,
    // Variables conformité : montant compta mensuel + compta × 12 (annuel).
    // Le template a `{Honos_mensuels} € HT par mois ... soit {Honos_annuels}
    // € HT pour une année de 12 mois.` - on injecte juste le nombre, le `€`
    // est en dur dans le template.
    Honos_mensuels: fmtNumFr(client.honoraires_compta),
    Honos_annuels: fmtNumFr(client.honoraires_compta * 12),
    Phrase_conformite: phraseConformite(client.honoraires_compta, ctx),
    Phrase_honos_bilan: phraseHonosBilan(ctx),
    Phrase_honos_creation: phraseHonosCreation(ctx),
    Phrase_juridique: phraseJuridique(ctx),
    Phrase_reprise: phraseReprise(ctx),
    Phrase_tdb: phraseTdb(ctx),
    Phrase_oss: phraseOss(ctx),
  };
}

/** Génère la LDM en mémoire et retourne le Buffer .docx. */
export function generateLDM(
  templateKey: LDMTemplateKey,
  client: LDMClientData,
  dirigeant: LDMDirigeantData
): Buffer {
  const templatePath = resolve(
    process.cwd(),
    "lib/templates",
    TEMPLATE_FILES[templateKey]
  );
  const content = readFileSync(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const payload = buildPayload(client, dirigeant);
  doc.render(payload);

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
