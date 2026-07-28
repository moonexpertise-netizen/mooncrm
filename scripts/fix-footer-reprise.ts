/**
 * Écarte le trait vertical du pied de page de la lettre de reprise.
 *
 * POURQUOI. La zone de texte de gauche (« 6 rue Adolphe Yvon – 75116 Paris »)
 * est en `wrap="none"` avec redimensionnement automatique : Word agrandit la
 * forme au rendu, LibreOffice — le moteur de conversion PDF — ne le fait pas
 * et laisse le texte déborder. Mesuré sur le PDF produit : le texte s'arrête à
 * 2 px du trait, qui semble donc coller au « Paris ». À l'impression PDF
 * depuis Word, le problème n'apparaît pas.
 *
 * On décale le connecteur vers la droite. Il reste très en amont de la zone de
 * texte de droite (qui démarre à 1828800 EMU), donc rien d'autre ne bouge.
 *
 * Idempotent : le script vise la position d'origine et ne fait rien si le
 * décalage est déjà appliqué.
 *
 *   node --import tsx scripts/fix-footer-reprise.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";

const TEMPLATE = resolve(process.cwd(), "lib/templates/lettre-reprise.docx");

/**
 * Position d'origine du connecteur et cible, en EMU dans le repère du groupe.
 *
 * Mesuré sur le PDF converti : à l'origine le trait tombait au milieu de
 * « Pa|ris ». Il faut le reculer d'environ 6,5 mm pour dégager la fin du texte
 * avec une marge confortable. La place existe : l'encre du bloc de droite ne
 * commence qu'environ 8 mm plus loin.
 *
 * Tentative écartée : annuler la marge interne de la zone de texte pour
 * ramener le texte à gauche. Sans effet — LibreOffice ignore `lIns` quand la
 * zone est en `wrap="none"`.
 */
const X_ORIGINE = 1696065;
const X_CIBLE = 1950000;

/** Butée : au-delà, le trait viendrait sur le texte de droite. */
const X_ENCRE_DROITE = 2100000;

function main() {
  if (X_CIBLE >= X_ENCRE_DROITE) {
    throw new Error(
      `Trait trop à droite : ${X_CIBLE} EMU toucherait le texte de droite (${X_ENCRE_DROITE}).`
    );
  }

  const zip = new PizZip(readFileSync(TEMPLATE));
  const chemin = "word/footer1.xml";
  const fichier = zip.file(chemin);
  if (!fichier) throw new Error("footer1.xml introuvable dans le gabarit.");

  let xml = fichier.asText();
  if (xml.includes(`<a:off x="${X_CIBLE}"`)) {
    console.log("Décalage déjà appliqué, rien à faire.");
    return;
  }
  const occurrences = xml.split(`<a:off x="${X_ORIGINE}"`).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `Connecteur introuvable à x=${X_ORIGINE}. Le pied de page a changé : vérifier la géométrie avant de rejouer ce script.`
    );
  }
  xml = xml.split(`<a:off x="${X_ORIGINE}"`).join(`<a:off x="${X_CIBLE}"`);

  zip.file(chemin, xml);
  writeFileSync(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

  const mm = ((X_CIBLE - X_ORIGINE) / 914400) * 25.4;
  console.log(`Trait décalé : ${X_ORIGINE} -> ${X_CIBLE} EMU (+${mm.toFixed(1)} mm), ${occurrences} occurrence(s).`);
}

main();
