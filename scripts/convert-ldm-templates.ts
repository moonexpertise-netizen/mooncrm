/**
 * Convertit les templates Word avec MERGEFIELDs (publipostage) en templates
 * compatibles docxtemplater (placeholders {Field}).
 *
 * Source : C:\Users\benp1\MOON Expertise\...\Modèles publipostage\*.docx
 * Sortie : lib/templates/ldm-{presentation,bnc}.docx
 *
 * Idempotent. Préserve le formatage (rPr) de la PREMIÈRE run dans le fldSimple.
 *
 * Lancement : npm run convert-ldm-templates
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';

const SOURCE_DIR = 'C:/Users/benp1/MOON Expertise/MOON Expertise - Documents/ZZZ - OUTILS SOURCES VDEF/3. MODELES WORD/Modèles publipostage';
const OUT_DIR = 'lib/templates';

const TEMPLATES: Array<{ src: string; out: string }> = [
  { src: 'LDM PRESENTATION.docx', out: 'ldm-presentation.docx' },
  { src: 'LDM BNC.docx', out: 'ldm-bnc.docx' },
];

/**
 * Mapping MERGEFIELD → placeholder docxtemplater (ASCII safe).
 * On garde les noms accentués mais on s'assure que docxtemplater les supporte
 * (les délimiteurs `{` `}` sont neutres).
 */
const FIELD_MAP: Record<string, string> = {
  Titre: 'Titre',
  Prénom: 'Prenom',
  Nom: 'Nom',
  Société: 'Societe',
  Activité: 'Activite',
  Adresse_Siège_social: 'Adresse_Siege',
  Code_postal: 'Code_postal',
  Ville: 'Ville',
  Clôture_mission_mois: 'Cloture_mission_mois',
  Clôture_mission_année: 'Cloture_mission_annee',
  Honos_mensuels: 'Honos_mensuels',
  Honos_annuels: 'Honos_annuels',
  Phrase_honos_bilan: 'Phrase_honos_bilan',
  Phrase_honos_création: 'Phrase_honos_creation',
  Phrase_juridique: 'Phrase_juridique',
  Phrase_reprise: 'Phrase_reprise',
  Phrase_tdb: 'Phrase_tdb',
};

/**
 * Convertit un MERGEFIELD en placeholder docxtemplater.
 * Format Word : <w:fldSimple w:instr=" MERGEFIELD Field "> ...runs... </w:fldSimple>
 *   ou avec quotes : <w:fldSimple w:instr=' MERGEFIELD "Field" '>
 */
function convertSimpleMergefields(xml: string): { xml: string; count: number; unknown: string[] } {
  let count = 0;
  const unknown: string[] = [];

  // Regex pour fldSimple : capture w:instr et le contenu
  const re = /<w:fldSimple\s+w:instr="([^"]*?MERGEFIELD[^"]*?)"\s*>([\s\S]*?)<\/w:fldSimple>/g;

  const result = xml.replace(re, (_match, instr: string, inner: string) => {
    // Extraire le nom du champ : MERGEFIELD "Société" ... ou MERGEFIELD Titre ...
    const m = instr.match(/MERGEFIELD\s+(?:"([^"]+)"|(\S+))/);
    if (!m) return _match;
    const fieldName = m[1] || m[2];
    const placeholder = FIELD_MAP[fieldName];
    if (!placeholder) {
      unknown.push(fieldName);
      return _match;
    }

    // Récupère le premier <w:rPr> dans le contenu pour préserver le formatage
    const rPrMatch = inner.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';

    count++;
    return `<w:r>${rPr}<w:t xml:space="preserve">{${placeholder}}</w:t></w:r>`;
  });

  return { xml: result, count, unknown };
}

/**
 * Walker : trouve chaque MERGEFIELD complexe (fldChar begin → end), capture
 * le nom dans l'instrText, capture les rPr de la run "separate" → "end"
 * (= la run d'affichage) pour préserver le formatage, et remplace tout le
 * bloc de runs par une seule run avec le placeholder.
 */
function convertComplexMergefields(xml: string): { xml: string; count: number; unknown: string[] } {
  let count = 0;
  const unknown: string[] = [];
  let result = '';
  let i = 0;

  while (i < xml.length) {
    // Trouve un fldChar begin
    const beginMarker = '<w:fldChar w:fldCharType="begin"';
    const beginIdx = xml.indexOf(beginMarker, i);
    if (beginIdx < 0) {
      result += xml.slice(i);
      break;
    }
    // Remonte au <w:r> qui contient ce fldChar
    const runOpen = xml.lastIndexOf('<w:r>', beginIdx);
    const runOpenWithProps = xml.lastIndexOf('<w:r ', beginIdx);
    const runStart = Math.max(runOpen, runOpenWithProps);
    if (runStart < 0 || runStart < i) {
      result += xml.slice(i, beginIdx + 1);
      i = beginIdx + 1;
      continue;
    }

    // Cherche l'instrText avec MERGEFIELD entre begin et le prochain end
    const endMarker = '<w:fldChar w:fldCharType="end"';
    const endIdx = xml.indexOf(endMarker, beginIdx);
    if (endIdx < 0) {
      result += xml.slice(i, runStart);
      i = runStart;
      continue;
    }
    // Trouve la fin de la run qui contient le end fldChar
    const endRunClose = xml.indexOf('</w:r>', endIdx);
    if (endRunClose < 0) {
      result += xml.slice(i, runStart);
      i = runStart;
      continue;
    }

    const block = xml.slice(runStart, endRunClose + '</w:r>'.length);

    // Extrait le nom du champ
    const m = block.match(/<w:instrText[^>]*>\s*MERGEFIELD\s+(?:"([^"]+)"|(\S+))[\s\S]*?<\/w:instrText>/);
    if (!m) {
      // Pas un MERGEFIELD (champ Word standard non-merge) → on laisse passer
      result += xml.slice(i, runStart + 1);
      i = runStart + 1;
      continue;
    }
    const fieldName = m[1] || m[2];
    const placeholder = FIELD_MAP[fieldName];

    if (!placeholder) {
      unknown.push(fieldName);
      result += xml.slice(i, endRunClose + 6);
      i = endRunClose + 6;
      continue;
    }

    // Récupère le premier <w:rPr> du bloc pour préserver le formatage
    const rPrMatch = block.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';

    // Tout ce qui précède le runStart est gardé tel quel
    result += xml.slice(i, runStart);
    // Tout le bloc fldChar est remplacé par une seule run avec le placeholder
    result += `<w:r>${rPr}<w:t xml:space="preserve">{${placeholder}}</w:t></w:r>`;
    count++;

    i = endRunClose + '</w:r>'.length;
  }

  return { xml: result, count, unknown };
}

function convert(srcPath: string, outPath: string) {
  console.log(`\n→ ${srcPath}`);
  const buf = readFileSync(srcPath);
  const zip = new PizZip(buf);
  const docXml = zip.file('word/document.xml')?.asText();
  if (!docXml) throw new Error('word/document.xml introuvable');

  const r1 = convertSimpleMergefields(docXml);
  const r2 = convertComplexMergefields(r1.xml);
  const allUnknown = [...new Set([...r1.unknown, ...r2.unknown])];

  if (allUnknown.length) {
    console.warn(`  ⚠ MERGEFIELDs non mappés (laissés tels quels) : ${allUnknown.join(', ')}`);
  }

  zip.file('word/document.xml', r2.xml);
  const out = zip.generate({ type: 'nodebuffer' });
  writeFileSync(outPath, out);
  console.log(`  ✓ ${r1.count + r2.count} MERGEFIELDs convertis → ${outPath}`);
}

for (const t of TEMPLATES) {
  convert(resolve(SOURCE_DIR, t.src), resolve(OUT_DIR, t.out));
}
console.log('\nTerminé.\n');
