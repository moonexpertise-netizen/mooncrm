/**
 * Script ponctuel pour corriger le template `ldm-presentation.docx` :
 *
 *  1. Remplace le bloc Word IF de salutation (`IF {Titre} = "Monsieur" "Cher" "Chère"`)
 *     par un simple placeholder `{Cher}` que docxtemplater remplit avec la
 *     bonne valeur ("Cher" ou "Chère" selon la civilité).
 *
 *  2. Section "Montant des honoraires" :
 *     - Remplace `{Honos_mensuels} € HT par mois à traiter, soit {Honos_annuels}
 *       € HT pour une année de 12 mois.` par `{Phrase_conformite}` (la phrase
 *       complète est désormais générée côté code).
 *     - Réordonne les bullets dans l'ordre attendu :
 *         conformité → bilan → juridique → pilotage → reprise → création
 *     - Ajoute le préfixe en gras "Honoraires de création : " devant
 *       le placeholder `{Phrase_honos_creation}` qui ne l'avait pas.
 *
 * Usage : npx tsx scripts/fix-ldm-template.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";

const TEMPLATES = ["ldm-presentation.docx", "ldm-bnc.docx"];

/** Étapes à appliquer. Pour debug, on peut passer SKIP_STEP=2,3,4 en env var. */
const skipSteps = new Set(
  (process.env.SKIP_STEP ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);
const doStep = (n: string) => !skipSteps.has(n);

function extractParagraph(
  xml: string,
  needle: string
): { match: string; start: number; end: number } | null {
  const idx = xml.indexOf(needle);
  if (idx === -1) return null;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  if (pStart === -1) return null;
  const pEnd = xml.indexOf("</w:p>", idx);
  if (pEnd === -1) return null;
  return { match: xml.slice(pStart, pEnd + 6), start: pStart, end: pEnd + 6 };
}

function fixTemplate(templateName: string): { changed: boolean; notes: string[] } {
  const path = resolve(process.cwd(), "lib/templates", templateName);
  let zip: PizZip;
  let xml: string;
  try {
    const content = readFileSync(path);
    zip = new PizZip(content);
    xml = zip.file("word/document.xml")!.asText();
  } catch (e) {
    return { changed: false, notes: [`SKIP ${templateName} : ${(e as Error).message}`] };
  }
  const notes: string[] = [];
  const original = xml;

  // ---------------------------------------------------------------------------
  // 1) Salutation : remplacer le bloc IF Word par {Cher}
  // ---------------------------------------------------------------------------
  if (!doStep("1")) {
    notes.push("  · SKIP étape 1 (salutation)");
  } else {
  // On cherche le bloc IF qui commence par fldChar begin et finit par end.
  // Le format Word natif : suite de <w:r> contenant fldChar + instrText.
  const ifBlockRe =
    /<w:r><w:fldChar w:fldCharType="begin"\/><\/w:r><w:r><w:instrText xml:space="preserve"> IF <\/w:instrText><\/w:r><w:r><w:rPr><w:noProof\/><\/w:rPr><w:t xml:space="preserve">\{Titre\}<\/w:t><\/w:r><w:r><w:instrText xml:space="preserve"> = "Monsieur" "Cher" "Chère" <\/w:instrText><\/w:r><w:r><w:fldChar w:fldCharType="separate"\/><\/w:r><w:r[^>]*><w:rPr><w:noProof\/><\/w:rPr><w:t>Cher<\/w:t><\/w:r><w:r><w:fldChar w:fldCharType="end"\/><\/w:r>/;
  if (ifBlockRe.test(xml)) {
    xml = xml.replace(
      ifBlockRe,
      '<w:r><w:rPr><w:noProof/></w:rPr><w:t>{Cher}</w:t></w:r>'
    );
    notes.push("  ✓ bloc IF salutation → {Cher}");
  } else {
    notes.push("  · pas de bloc IF salutation détecté (peut-être déjà corrigé)");
  }
  } // end step 1

  // ---------------------------------------------------------------------------
  // 2) Bullet "Forfait conformité" :
  //    `{Honos_mensuels} € HT par mois à traiter, soit {Honos_annuels} € HT pour
  //     une année de 12 mois.` → `{Phrase_conformite}`
  //
  // Approche : on remplace `{Honos_mensuels}` par `{Phrase_conformite}` dans son
  // <w:t>, puis on vide les <w:t> contenant le reste (texte HT, {Honos_annuels},
  // texte HT pour année).
  // ---------------------------------------------------------------------------
  if (!doStep("2")) {
    notes.push("  · SKIP étape 2 (conformité)");
  } else if (xml.includes("{Honos_mensuels}")) {
    xml = xml.replace(
      /<w:t xml:space="preserve">\{Honos_mensuels\}<\/w:t>/,
      '<w:t xml:space="preserve">{Phrase_conformite}</w:t>'
    );
    xml = xml.replace(
      /<w:t xml:space="preserve"> € HT par mois à traiter, soit <\/w:t>/,
      '<w:t></w:t>'
    );
    xml = xml.replace(
      /<w:t xml:space="preserve">\{Honos_annuels\}<\/w:t>/,
      '<w:t></w:t>'
    );
    xml = xml.replace(
      /<w:t xml:space="preserve"> € HT pour une année de 12 mois\.<\/w:t>/,
      '<w:t></w:t>'
    );
    notes.push("  ✓ ligne conformité → {Phrase_conformite}");
  } else {
    notes.push("  · {Honos_mensuels} déjà retiré");
  }

  // ---------------------------------------------------------------------------
  // 3) Réorganiser les bullets : ordre actuel reprise / juridique / pilotage
  //    → ordre voulu juridique / pilotage / reprise
  // ---------------------------------------------------------------------------
  if (!doStep("3")) {
    notes.push("  · SKIP étape 3 (réorder bullets)");
  } else {
  const repriseP = extractParagraph(xml, "{Phrase_reprise}");
  const juridiqueP = extractParagraph(xml, "{Phrase_juridique}");
  const pilotageP = extractParagraph(xml, "{Phrase_tdb}");

  if (repriseP && juridiqueP && pilotageP) {
    // Ordre actuel selon position dans le XML
    const inOrder = [repriseP, juridiqueP, pilotageP].sort((a, b) => a.start - b.start);
    // Vérifie qu'on a bien reprise avant juridique avant pilotage
    if (
      inOrder[0].match === repriseP.match &&
      inOrder[1].match === juridiqueP.match &&
      inOrder[2].match === pilotageP.match
    ) {
      // Replace en bloc : on remplace la zone [repriseP.start … pilotageP.end]
      // par juridique + pilotage + reprise
      const blockStart = repriseP.start;
      const blockEnd = pilotageP.end;
      const newBlock = juridiqueP.match + pilotageP.match + repriseP.match;
      xml = xml.slice(0, blockStart) + newBlock + xml.slice(blockEnd);
      notes.push("  ✓ bullets réordonnés : juridique / pilotage / reprise");
    } else {
      notes.push("  · ordre des bullets déjà correct (ou différent du prévu)");
    }
  } else {
    notes.push("  ! placeholders reprise/juridique/pilotage introuvables");
  }
  } // end step 3

  // ---------------------------------------------------------------------------
  // 4) Préfixer {Phrase_honos_creation} avec "Honoraires de création : " en gras
  // ---------------------------------------------------------------------------
  if (!doStep("4")) {
    notes.push("  · SKIP étape 4 (préfixe création)");
  } else {
  // Approche sûre (sans regex backtrack) : on trouve la position du placeholder,
  // on remonte au <w:r d'ouverture du run qui le contient, et on insère un
  // nouveau <w:r> avec le préfixe en gras AVANT cette position.
  if (!xml.includes("Honoraires de création")) {
    const placeholderIdx = xml.indexOf("{Phrase_honos_creation}");
    if (placeholderIdx === -1) {
      notes.push("  ! placeholder {Phrase_honos_creation} introuvable");
    } else {
      // Remonte au <w:r> ou <w:r ...> qui ouvre le run de ce placeholder.
      // Attention : `<w:r` matche aussi `<w:rPr`, `<w:rFonts`, `<w:rsid` etc.
      // On cherche donc explicitement `<w:r>` (sans attr) ou `<w:r ` (avec attrs).
      const a = xml.lastIndexOf("<w:r>", placeholderIdx);
      const b = xml.lastIndexOf("<w:r ", placeholderIdx);
      const runStart = Math.max(a, b);
      // Vérifie que ce <w:r est bien le run direct (pas de </w:r> entre runStart
      // et le placeholder).
      const closingBetween = xml.lastIndexOf("</w:r>", placeholderIdx);
      if (runStart === -1 || closingBetween > runStart) {
        notes.push("  ! impossible de localiser le run contenant le placeholder");
      } else {
        const prefixRun =
          '<w:r w:rsidRPr="009C63AB"><w:rPr><w:rFonts w:cstheme="majorHAnsi"/><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Honoraires de création : </w:t></w:r>';
        xml = xml.slice(0, runStart) + prefixRun + xml.slice(runStart);
        notes.push("  ✓ préfixe \"Honoraires de création : \" ajouté");
      }
    }
  } else {
    notes.push("  · préfixe \"Honoraires de création\" déjà présent");
  }
  } // end step 4

  // ---------------------------------------------------------------------------
  // 5) Retirer le résidu de publipostage Excel (mailMerge) qui fait que Word
  //    demande "SELECT * FROM `LDM$`" à l'ouverture et plante si la source
  //    .xlsx locale n'existe pas.
  //    Approche prudente : on retire UNIQUEMENT le bloc <w:mailMerge> dans
  //    word/settings.xml et les Relationships mailMergeSource. On garde
  //    `recipientData.xml` et son entrée Content_Types, qui sont inoffensifs
  //    sans le bloc mailMerge (Word les ignore).
  // ---------------------------------------------------------------------------
  let mailMergeRemoved = false;
  if (!doStep("5")) {
    notes.push("  · SKIP étape 5 (mailMerge)");
  } else {
  const settingsFile = zip.file("word/settings.xml");
  if (settingsFile) {
    const settingsXml = settingsFile.asText();
    const cleaned = settingsXml.replace(/<w:mailMerge>[\s\S]*?<\/w:mailMerge>/, "");
    if (cleaned !== settingsXml) {
      zip.file("word/settings.xml", cleaned);
      mailMergeRemoved = true;
    }
  }

  const settingsRelsFile = zip.file("word/_rels/settings.xml.rels");
  if (settingsRelsFile) {
    const relsXml = settingsRelsFile.asText();
    // [^>]* (et non [^/]*) : Type/Target contiennent des "/" qu'il faut autoriser.
    // On retire UNIQUEMENT les rels mailMergeSource. La rel recipientData reste.
    const cleaned = relsXml.replace(
      /<Relationship[^>]*mailMergeSource[^>]*\/>/g,
      ""
    );
    if (cleaned !== relsXml) {
      // Si le fichier ne contient plus aucune Relationship (cas BNC qui n'a
      // que des mailMergeSource), on le supprime entièrement — un rels vide
      // fait planter Word à l'ouverture.
      if (!/<Relationship\b/.test(cleaned)) {
        zip.remove("word/_rels/settings.xml.rels");
      } else {
        zip.file("word/_rels/settings.xml.rels", cleaned);
      }
      mailMergeRemoved = true;
    }
  }

  if (mailMergeRemoved) {
    notes.push("  ✓ résidu publipostage Excel (mailMerge SQL) retiré");
  } else {
    notes.push("  · pas de résidu mailMerge");
  }
  } // end step 5

  // ---------------------------------------------------------------------------
  // 7) Nettoyer les paragraphes orphelins de saut de page (`<w:br w:type=
  //    "page"/>`) qui héritaient d'un `<w:u w:val="single"/>` parasite —
  //    cet underline dessinait un trait noir en haut de la page suivante.
  //
  //    /!\ On NE SUPPRIME PAS le paragraphe entier : le saut de page lui-même
  //    sert à démarrer une nouvelle section (ex. "Cette mission s'appuie
  //    sur :" doit commencer sur une nouvelle page).
  // ---------------------------------------------------------------------------
  if (!doStep("7")) {
    notes.push("  · SKIP étape 7 (underline parasites)");
  } else {
    const emptyBreakRe =
      /<w:p [^>]*>(?:<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)?<w:r[^>]*>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:br w:type="page"\/><\/w:r><\/w:p>/g;
    let cleaned = 0;
    xml = xml.replace(emptyBreakRe, (match) => {
      const before = match;
      const after = match.replace(/<w:u w:val="single"\/>/g, "");
      if (after !== before) cleaned++;
      return after;
    });
    if (cleaned > 0) {
      notes.push(`  ✓ ${cleaned} underline parasite(s) retiré(s) (sauts de page conservés)`);
    } else {
      notes.push("  · pas d'underline parasite");
    }
  }

  // ---------------------------------------------------------------------------
  // 6) BNC SEULEMENT : retirer entièrement le bullet "Travaux juridiques
  //    annuels" — les BNC n'ont pas de juridique.
  // ---------------------------------------------------------------------------
  if (templateName === "ldm-bnc.docx") {
    if (!doStep("6")) {
      notes.push("  · SKIP étape 6 (retrait juridique BNC)");
    } else {
      const juridiqueP = extractParagraph(xml, "{Phrase_juridique}");
      if (juridiqueP) {
        xml = xml.slice(0, juridiqueP.start) + xml.slice(juridiqueP.end);
        notes.push("  ✓ bullet juridique retiré (spécifique BNC)");
      } else {
        notes.push("  · bullet juridique déjà retiré (BNC)");
      }
    }

  }

  // ---------------------------------------------------------------------------
  // Sauvegarde
  // ---------------------------------------------------------------------------
  if (xml === original && !mailMergeRemoved) {
    return { changed: false, notes };
  }
  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(path, out);
  return { changed: true, notes };
}

console.log("Patching LDM templates…");
for (const t of TEMPLATES) {
  console.log(`\n→ ${t}`);
  const { changed, notes } = fixTemplate(t);
  for (const n of notes) console.log(n);
  console.log(changed ? "  ✓ saved" : "  · no change");
}
