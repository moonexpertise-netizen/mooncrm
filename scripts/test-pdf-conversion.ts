/**
 * Script de test : génère un PDF à partir du template présentation
 * avec des valeurs bidon. Permet de valider la chaîne docxtemplater +
 * ConvertAPI sans passer par le serveur Next.js.
 */

import { writeFileSync } from "node:fs";
import { generateLDM } from "../lib/ldm-generator";
import { docxToPdf } from "../lib/docx-to-pdf";

async function main() {
  console.log("→ Génération DOCX…");
  const docx = generateLDM(
    "presentation",
    {
      denomination: "DOSSIER TEST",
      activite: "Pompes à chaleur",
      origine: "3 - Reprise",
      adresse_siege: "6 rue de Castiglione",
      code_postal: "75002",
      ville: "Paris",
      fin_mission_date: "2026-12-31",
      honoraires_compta: 225,
      forfait_pilotage: 75,
      forfait_bilan: 450,
      honoraires_jur: 400,
      honoraires_reprise: 1000,
      honoraires_creation: 1000,
      type_honos_bilans: "Facturés",
      type_honos_jur: "Facturés",
      type_honos_creation: "Facturés",
      type_honos_reprise: "Facturés",
      tdb_periode: "Trimestriel",
      tdb_honos_periode: 225,
      oss_periode: "Trimestriel",
      oss_honos_trimestre: 150,
    },
    { civilite: "M.", prenom: "Benjamin", nom: "PEREZ" }
  );
  console.log("  ✓ DOCX " + docx.length + " bytes");

  console.log("→ Conversion via ConvertAPI…");
  const pdf = await docxToPdf(docx, "test.docx");
  console.log("  ✓ PDF " + pdf.length + " bytes");

  writeFileSync("tmp-test-output.pdf", pdf);
  console.log("→ Écrit dans tmp-test-output.pdf");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
