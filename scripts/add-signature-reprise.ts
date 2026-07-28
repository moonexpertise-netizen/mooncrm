/**
 * Insère le bloc de signature électronique dans le gabarit Word de la lettre
 * de reprise (lib/templates/lettre-reprise.docx).
 *
 * POURQUOI un script plutôt qu'une modification manuelle dans Word : le bloc
 * doit contenir un placeholder docxtemplater `{Date_signature}` dans UN SEUL
 * run XML. Word découpe volontiers un texte saisi à la main en plusieurs runs
 * (correcteur orthographique, rsid…), ce qui casse la substitution. En
 * écrivant le XML nous-mêmes, le placeholder reste intact.
 *
 * Idempotent : relancer le script remplace le bloc existant au lieu d'en
 * empiler un second. À rejouer si le gabarit est un jour réexporté depuis Word.
 *
 *   node --import tsx scripts/add-signature-reprise.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";

const TEMPLATE = resolve(process.cwd(), "lib/templates/lettre-reprise.docx");
const SIGNATURE = resolve(process.cwd(), "lib/templates/signature-benjamin.png");

/** Identifiants dédiés, hors de la plage utilisée par Word (rId1..rId15). */
const REL_ID = "rId100";
const MEDIA = "media/signature-benjamin.png";

/** Signature : 449x70 px. Largeur cible 1,9 pouce, hauteur proportionnelle. */
const EMU_PAR_POUCE = 914400;
const LARGEUR_POUCES = 1.9;
const CX = Math.round(LARGEUR_POUCES * EMU_PAR_POUCE);
const CY = Math.round(((LARGEUR_POUCES * 70) / 449) * EMU_PAR_POUCE);

/** Marqueurs délimitant le bloc, pour pouvoir le retrouver et le remplacer. */
const DEBUT = "<!--SIGNATURE_MOON_DEBUT-->";
const FIN = "<!--SIGNATURE_MOON_FIN-->";

const POLICE = '<w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light" w:cs="Calibri Light"/>';

/** Un paragraphe de texte dans l'encadré. */
function paragraphe(texte: string, taille: number, gris = false): string {
  const couleur = gris ? '<w:color w:val="808080"/>' : "";
  return (
    `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>` +
    `<w:rPr>${POLICE}<w:sz w:val="${taille}"/>${couleur}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${POLICE}<w:sz w:val="${taille}"/>${couleur}</w:rPr>` +
    `<w:t xml:space="preserve">${texte}</w:t></w:r></w:p>`
  );
}

/** L'image de signature, en ligne dans un paragraphe. */
const paragrapheImage =
  `<w:p><w:pPr><w:spacing w:before="120" w:after="0"/></w:pPr><w:r><w:drawing>` +
  `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
  `<wp:extent cx="${CX}" cy="${CY}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
  `<wp:docPr id="900" name="Signature Benjamin PEREZ"/>` +
  `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
  `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:nvPicPr><pic:cNvPr id="900" name="Signature Benjamin PEREZ"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="${REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${CX}" cy="${CY}"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
  `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

/** Encadré complet : tableau 1 cellule, bordure grise fine. */
const BLOC =
  DEBUT +
  `<w:tbl><w:tblPr><w:tblW w:w="4400" w:type="dxa"/>` +
  `<w:tblBorders>` +
  ["top", "left", "bottom", "right"]
    .map((c) => `<w:${c} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
    .join("") +
  `</w:tblBorders>` +
  `<w:tblCellMar><w:top w:w="113" w:type="dxa"/><w:left w:w="170" w:type="dxa"/>` +
  `<w:bottom w:w="113" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tblCellMar>` +
  `<w:tblLook w:val="04A0" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>` +
  `</w:tblPr><w:tblGrid><w:gridCol w:w="4400"/></w:tblGrid>` +
  `<w:tr><w:tc><w:tcPr><w:tcW w:w="4400" w:type="dxa"/></w:tcPr>` +
  paragraphe("Signé électroniquement par Benjamin PEREZ", 18) +
  paragraphe("Le {Date_signature}", 18) +
  paragrapheImage +
  `</w:tc></w:tr></w:tbl>` +
  // Word exige un paragraphe après un tableau.
  `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>` +
  FIN;

function main() {
  const zip = new PizZip(readFileSync(TEMPLATE));

  // 1. L'image dans le paquet.
  zip.file(`word/${MEDIA}`, readFileSync(SIGNATURE));

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

  doc = doc.slice(0, insertion) + BLOC + doc.slice(insertion);
  zip.file("word/document.xml", doc);

  writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`Bloc de signature inséré (image ${CX}x${CY} EMU, relation ${REL_ID}).`);
  console.log("Placeholder à alimenter : {Date_signature}");
}

main();
