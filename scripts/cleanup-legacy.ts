/**
 * Cleanup one-shot post-import :
 *   1. Soft-delete les subs des types redondants / hors scope (COMPTA,
 *      DEPOT_COMPTES, FACTURATION_JUR). L'historique reste en DB.
 *   2. Supprime les instances TVS au format "YYYY-MM" (résidus des colonnes
 *      Notion TVSM/TVST). On garde uniquement la TVS annuelle générée par
 *      le moteur (échéance 24/01 N+1).
 *   3. Dédoublonne les modes TVA actifs pour un même (client, année) :
 *      keep le mode qui a le plus d'instances avec un statut "vrai"
 *      (pas A_FAIRE), désactive (soft) les autres.
 *
 * Idempotent : peut être relancé sans dégâts.
 *
 * Lancement : `npm run cleanup-legacy`
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes : NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TVA_MODES = ['TVA_MENSUELLE', 'TVA_TRIMESTRIELLE', 'TVA_ANNUELLE_CA12', 'TVA_NON_SOUMIS'];
const LEGACY_TYPES = ['COMPTA', 'DEPOT_COMPTES', 'FACTURATION_JUR'];

async function main() {
  console.log('\n=== Cleanup legacy ===\n');

  // 1. Soft-delete legacy types
  console.log('1. Soft-delete COMPTA / DEPOT_COMPTES / FACTURATION_JUR...');
  const { data: legacyDeact, error: e1 } = await sb
    .from('obligation_subscriptions')
    .update({ actif: false })
    .in('type', LEGACY_TYPES)
    .eq('actif', true)
    .select('id');
  if (e1) throw new Error(e1.message);
  console.log(`   -> ${legacyDeact?.length ?? 0} subs désactivées\n`);

  // 2. Suppression instances TVS au format YYYY-MM
  console.log('2. Suppression des instances TVS au format YYYY-MM...');
  const { data: tvsDeleted, error: e2 } = await sb
    .from('obligations')
    .delete()
    .eq('type', 'TVS')
    .like('periode', '____-__') // 4 chiffres + tiret + 2 chiffres
    .select('id');
  if (e2) throw new Error(e2.message);
  console.log(`   -> ${tvsDeleted?.length ?? 0} instances supprimées\n`);

  // 3. Dédoublonnage TVA actives par (client, année)
  console.log('3. Dédoublonnage des modes TVA actifs...');
  const { data: tvaSubs, error: e3 } = await sb
    .from('obligation_subscriptions')
    .select('id, client_id, annee, type')
    .in('type', TVA_MODES)
    .eq('actif', true);
  if (e3) throw new Error(e3.message);

  // Group by (client_id, annee)
  const groups = new Map<string, Array<{ id: string; client_id: string; annee: number; type: string }>>();
  for (const sub of tvaSubs ?? []) {
    const key = `${sub.client_id}|${sub.annee}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sub);
  }

  let conflicts = 0;
  let resolved = 0;
  for (const [key, subs] of groups) {
    if (subs.length <= 1) continue;
    conflicts++;

    // Pour chaque sub, compter les instances avec statut != A_FAIRE
    let winner = subs[0];
    let winnerScore = -1;
    for (const sub of subs) {
      const { count } = await sb
        .from('obligations')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_id', sub.id)
        .neq('statut_logique', 'A_FAIRE');
      const score = count ?? 0;
      if (score > winnerScore) {
        winner = sub;
        winnerScore = score;
      }
    }

    const losers = subs.filter((s) => s.id !== winner.id).map((s) => s.id);
    if (losers.length) {
      const { error } = await sb
        .from('obligation_subscriptions')
        .update({ actif: false })
        .in('id', losers);
      if (error) {
        console.error(`   Erreur dédoublonnage ${key}:`, error.message);
        continue;
      }
      resolved++;
      console.log(`   ${key} : gardé ${winner.type} (${winnerScore} statuts actifs), désactivé ${losers.length} autre(s)`);
    }
  }
  console.log(`   -> ${conflicts} conflit(s), ${resolved} résolu(s)\n`);

  console.log('Cleanup terminé.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
