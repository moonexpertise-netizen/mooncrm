/**
 * Backfill ponctuel : depuis le CSV Notion, met à jour pour chaque client :
 *   - forfait_pilotage <- €  - Dash MRR (M€)
 *   - forfait_bilan    <- €  - Bilan (A€)
 *   - honoraires_compta (mensuel) <- € - MRR (M€)   [si actuellement à 0]
 *
 * Match par SIREN (puis dénomination en fallback). Idempotent.
 *
 * Lancement : `npm run backfill-forfaits`
 */

import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CSV_PATH = 'notion/raw/notion_export_2/Prospects Clients 143aff9738b480e39327fdd102f210eb.csv';

function parseEuro(v: string | undefined | null): number {
  if (!v) return 0;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanSiren(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = String(v).replace(/\D/g, '');
  return s.length === 9 ? s : null;
}

async function main() {
  const raw = readFileSync(CSV_PATH, 'utf8');
  const rows: Array<Record<string, string>> = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  console.log(`\n=== Backfill forfaits depuis ${rows.length} lignes Notion ===\n`);

  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const siren = cleanSiren(r['0 - Siren']);
    const denom = (r['0 - Dénomination'] ?? '').trim();
    if (!siren && !denom) { skipped++; continue; }

    const pilotage = parseEuro(r['€ - Dash MRR (M€)']);
    const bilan = parseEuro(r['€ - Bilan (A€)']);
    const compta = parseEuro(r['€ - MRR (M€)']);

    // Trouve le client (priorité SIREN, fallback dénomination)
    let clientId: string | null = null;
    if (siren) {
      const { data } = await sb.from('clients').select('id, honoraires_compta').eq('siren', siren).maybeSingle();
      if (data) clientId = data.id;
    }
    if (!clientId && denom) {
      const { data } = await sb.from('clients').select('id, honoraires_compta').eq('denomination', denom).maybeSingle();
      if (data) clientId = data.id;
    }
    if (!clientId) { skipped++; continue; }

    // Écrasement systématique : la source de vérité c'est Notion.
    //   compta   ← MRR (M€)        (mensuel)
    //   bilan    ← Bilan (A€)      (annuel)
    //   pilotage ← Dash MRR (M€)   (mensuel)
    const patch = {
      honoraires_compta: compta,
      forfait_bilan: bilan,
      forfait_pilotage: pilotage,
    };

    const { error } = await sb.from('clients').update(patch).eq('id', clientId);
    if (error) { console.error(`  ! ${denom} : ${error.message}`); continue; }
    updated++;
    if (compta > 0 || pilotage > 0 || bilan > 0) {
      console.log(
        `  ✓ ${denom.padEnd(35)} compta=${compta}€/m  pilotage=${pilotage}€/m  bilan=${bilan}€/a`
      );
    }
  }

  console.log(`\n${updated} client(s) mis à jour, ${skipped} ignoré(s).`);
}

main().catch((e) => { console.error('Erreur :', e); process.exit(1); });
