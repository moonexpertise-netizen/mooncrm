/**
 * Génère une LDM .docx à partir d'un template docxtemplater et des données client.
 * Templates dans lib/templates/ldm-{presentation,bnc}.docx.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  phraseHonosBilan,
  phraseHonosCreation,
  phraseJuridique,
  phraseReprise,
  phraseTdb,
  type LDMContext,
} from "./ldm-phrases";

export type LDMTemplateKey = "presentation" | "bnc";

const TEMPLATE_FILES: Record<LDMTemplateKey, string> = {
  presentation: "ldm-presentation.docx",
  bnc: "ldm-bnc.docx",
};

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function fmtEuroBare(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n)) + " €";
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
  tdb_periode: "Mensuel" | "Trimestriel" | null;
  tdb_honos_periode: number;
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

  // Honoraires mensuels = compta + pilotage. Annuels = ARR complet.
  const honos_mensuels = client.honoraires_compta + client.forfait_pilotage;
  const honos_annuels =
    honos_mensuels * 12 + client.forfait_bilan + client.honoraires_jur;

  const ctx: LDMContext = {
    type_honos_bilans: client.type_honos_bilans,
    tdb_periode: client.tdb_periode,
    tdb_honos_periode: client.tdb_honos_periode,
    honoraires_jur: client.honoraires_jur,
    honoraires_reprise: client.honoraires_reprise,
    honoraires_creation: client.honoraires_creation,
    forfait_pilotage: client.forfait_pilotage,
    honos_mensuels: honos_mensuels,
  };

  return {
    Titre: dirigeant.civilite ?? "",
    Prenom: dirigeant.prenom ?? "",
    Nom: dirigeant.nom ?? "",
    Societe: client.denomination,
    Activite: client.activite ?? "",
    Adresse_Siege: client.adresse_siege ?? "",
    Code_postal: client.code_postal ?? "",
    Ville: client.ville ?? "",
    Cloture_mission_mois: cloture_mois,
    Cloture_mission_annee: cloture_annee,
    Honos_mensuels: fmtEuroBare(honos_mensuels),
    Honos_annuels: fmtEuroBare(honos_annuels),
    Phrase_honos_bilan: phraseHonosBilan(ctx),
    Phrase_honos_creation: phraseHonosCreation(ctx),
    Phrase_juridique: phraseJuridique(ctx),
    Phrase_reprise: phraseReprise(ctx),
    Phrase_tdb: phraseTdb(ctx),
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
