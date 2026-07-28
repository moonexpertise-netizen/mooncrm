/**
 * Insère le bloc de signature électronique dans le gabarit Word de la lettre
 * de reprise (lib/templates/lettre-reprise.docx).
 *
 * LE BLOC VIENT DU DOCUMENT DE BENJAMIN, à l'identique. Il a été extrait de
 * « DHURY SAS - Lettre de reprise 2026 Draft2.docx » et vit dans
 * lib/templates/signature-bloc.xml + signature-bloc.png. C'est un paragraphe
 * unique contenant un ancrage flottant : la capture du bloc de signature
 * (« Signé par Benjamin Perez », la signature manuscrite et les références
 * doc_/tx_) avec, par-dessus, une zone de texte portant l'horodatage.
 *
 * Seule adaptation par rapport à l'original : le champ DATE de Word a été
 * remplacé par le placeholder docxtemplater {Date_signature}, alimenté au
 * moment de la génération. Le rendu est identique, mais la date ne dépend plus
 * du rafraîchissement des champs par le convertisseur PDF.
 *
 * Idempotent : relancer le script remplace le bloc existant au lieu d'en
 * empiler un second. À rejouer si le gabarit est un jour réexporté depuis Word.
 *
 *   node --import tsx scripts/add-signature-reprise.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";

const DOSSIER = resolve(process.cwd(), "lib/templates");
const TEMPLATE = resolve(DOSSIER, "lettre-reprise.docx");
const BLOC_XML = resolve(DOSSIER, "signature-bloc.xml");
const BLOC_PNG = resolve(DOSSIER, "signature-bloc.png");

/** Identifiant dédié, hors de la plage utilisée par Word (rId1..rId15). */
const REL_ID = "rId100";
const MEDIA = "media/signature-bloc.png";

/** Marqueurs délimitant le bloc, pour pouvoir le retrouver et le remplacer. */
const DEBUT = "<!--SIGNATURE_MOON_DEBUT-->";
const FIN = "<!--SIGNATURE_MOON_FIN-->";

function main() {
  const bloc = readFileSync(BLOC_XML, "utf8").trim();
  if (!bloc.includes("{Date_signature}")) {
    throw new Error("signature-bloc.xml ne contient pas le placeholder {Date_signature}.");
  }
  if (!bloc.includes(`r:embed="${REL_ID}"`)) {
    throw new Error(`signature-bloc.xml ne référence pas l'image ${REL_ID}.`);
  }

  const zip = new PizZip(readFileSync(TEMPLATE));

  // 1. L'image dans le paquet.
  zip.file(`word/${MEDIA}`, readFileSync(BLOC_PNG));

  // 2. La relation vers l'image.
  const relsPath = "word/_rels/document.xml.rels";
  let rels = zip.file(relsPath)!.asText();
  if (!rels.includes(`Id="${REL_ID}"`)) {
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${MEDIA}"/></Relationships>`
    );
    zip.file(relsPath, rels);
  }

  // 3. Le bloc dans le corps du document.
  let doc = zip.file("word/document.xml")!.asText();

  // Relance : on retire l'ancien bloc avant d'insérer le nouveau.
  const i = doc.indexOf(DEBUT);
  if (i !== -1) {
    const j = doc.indexOf(FIN, i);
    if (j === -1) throw new Error("Bloc signature corrompu : marqueur de fin absent.");
    doc = doc.slice(0, i) + doc.slice(j + FIN.length);
    console.log("Ancien bloc de signature retiré.");
  }

  // Ancrage : la fin du paragraphe qui contient « Benjamin PEREZ ».
  const ancre = doc.indexOf("<w:t>Benjamin PEREZ</w:t>");
  if (ancre === -1) {
    throw new Error(
      "Ancre introuvable : le gabarit ne contient plus le paragraphe « Benjamin PEREZ »."
    );
  }
  const finParagraphe = doc.indexOf("</w:p>", ancre);
  if (finParagraphe === -1) throw new Error("Paragraphe d'ancrage mal formé.");
  const insertion = finParagraphe + "</w:p>".length;

  doc = doc.slice(0, insertion) + DEBUT + bloc + FIN + doc.slice(insertion);
  zip.file("word/document.xml", doc);

  writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`Bloc de signature inséré (${bloc.length} caractères, relation ${REL_ID}).`);
  console.log("Placeholder à alimenter : {Date_signature}");
}

main();
