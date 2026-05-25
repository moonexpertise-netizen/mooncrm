/**
 * Valide qu'un template .docx peut être chargé + rendu par docxtemplater
 * sans erreur. Génère un docx avec des valeurs bidon pour repérer
 * les balises XML cassées ou les placeholders manquants.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const templateName = process.argv[2] ?? "ldm-presentation.docx";
const path = resolve(process.cwd(), "lib/templates", templateName);

try {
  const content = readFileSync(path);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  const payload = {
    Cher: "Cher",
    Titre: "M.",
    Prenom: "Benjamin",
    Nom: "PEREZ",
    Societe: "DOSSIER TEST",
    Activite: "Pompes à chaleur",
    Adresse_Siege: "6 rue de Castiglione",
    Code_postal: "75002",
    Ville: "Paris",
    Cloture_mission_mois: "décembre",
    Cloture_mission_annee: "2026",
    Phrase_conformite: "225 € HT par mois à traiter, soit 2 700 € HT pour une année de 12 mois.",
    Phrase_honos_bilan: "Les travaux de bilans seront facturés 450 € HT chaque année.",
    Phrase_honos_creation: "La création de la société sera facturée 1 000 € HT, hors frais de greffe.",
    Phrase_juridique: "Les travaux juridiques annuels (AGO + Dépôt des comptes au greffe) seront facturés 400 € HT hors frais de greffe, chaque année.",
    Phrase_reprise: "Les travaux de reprise seront facturés 1 000 € HT.",
    Phrase_tdb: "Souscription du forfait pilotage, avec présentation d'un tableau de bord trimestriel. Chaque période de restitution sera facturée 225 € HT.",
  };

  doc.render(payload);
  const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  const testPath = resolve(process.cwd(), "tmp-test-output.docx");
  writeFileSync(testPath, out);
  console.log(`✓ Template ${templateName} valide`);
  console.log(`  Output: ${testPath} (${out.length} bytes)`);
} catch (e) {
  console.error(`✗ ERREUR sur ${templateName}:`);
  console.error(e);
  process.exit(1);
}
