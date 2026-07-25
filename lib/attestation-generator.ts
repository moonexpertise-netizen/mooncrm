/**
 * Générateur d'attestations (documents .docx distincts des lettres de mission).
 * Chaque modèle vit dans lib/templates/attestation-*.docx. Extensible : on
 * ajoutera des clés au fur et à mesure des modèles fournis.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export type AttestationKey = "ca";

const TEMPLATE_FILES: Record<AttestationKey, string> = {
  ca: "attestation-ca.docx",
};

/** Données du dossier (auto) pour une attestation. */
export type AttestationClient = {
  denomination: string;
  dirigeant_prenom: string | null;
  dirigeant_nom: string | null;
  mois_signature: string | null; // date signature LDM (ISO)
  jour_cloture: number | null;
  mois_cloture: number | null;
};

/** Champs saisis dans la boîte de dialogue (attestation de CA). */
export type AttestationCAExtra = {
  date_debut: string; // JJ/MM/AAAA
  date_fin: string;   // JJ/MM/AAAA
  motif: string;      // cadre de l'attestation (texte libre)
  annee: number;      // année de la mission de présentation (-> clôture)
  ca: string;         // montant du CA (nombre en texte, "€ HT" est dans le modèle)
};

const pad = (n: number) => String(n).padStart(2, "0");

/** JJ/MM/AAAA depuis une date ISO. */
function frDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Montant "77 332.60" : milliers espacés, 2 décimales, séparateur point (comme le modèle). */
export function formatCA(raw: string): string {
  const n = parseFloat(String(raw).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return String(raw).trim();
  const [int, dec] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${dec}`;
}

export function generateAttestationCA(
  client: AttestationClient,
  extra: AttestationCAExtra
): Buffer {
  const templatePath = resolve(process.cwd(), "lib/templates", TEMPLATE_FILES.ca);
  const doc = new Docxtemplater(new PizZip(readFileSync(templatePath)), {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Clôture de l'exercice de présentation choisi : jour/mois du dossier + année
  // choisie (défaut 31/12 si le dossier n'a pas de clôture renseignée).
  const cloture =
    client.jour_cloture && client.mois_cloture
      ? `${pad(client.jour_cloture)}/${pad(client.mois_cloture)}/${extra.annee}`
      : `31/12/${extra.annee}`;

  doc.render({
    Societe: client.denomination,
    Prenom: client.dirigeant_prenom ?? "",
    Nom: client.dirigeant_nom ?? "",
    Date_ldm: frDate(client.mois_signature),
    Date_debut: extra.date_debut,
    Date_fin: extra.date_fin,
    Motif: extra.motif,
    Cloture: cloture,
    CA: formatCA(extra.ca),
  });

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
