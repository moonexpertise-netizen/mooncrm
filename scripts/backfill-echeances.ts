/**
 * Backfill des échéances pour toutes les obligations existantes.
 *
 * Boucle sur tous les clients × toutes leurs années configurées, applique le
 * moteur pour calculer les échéances, et met à jour la colonne `echeance` sur
 * les instances existantes. Les statuts ne sont jamais touchés.
 *
 * Lancement : `npm run backfill-echeances`
 */

import { createClient } from '@supabase/supabase-js';
import { generateInstancesForType } from '../lib/obligations-engine';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes : NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('\n=== Backfill échéances ===\n');

  const { data: clients, error: e0 } = await sb
    .from('clients')
    .select('id, denomination, jour_cloture, mois_cloture');
  if (e0) throw new Error(e0.message);
  console.log(`Clients : ${clients?.length ?? 0}`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const client of clients ?? []) {
    const { data: subs, error: e1 } = await sb
      .from('obligation_subscriptions')
      .select('id, type, annee')
      .eq('client_id', client.id)
      .eq('actif', true);
    if (e1) {
      console.error(`Erreur subs ${client.denomination}:`, e1.message);
      continue;
    }

    for (const sub of subs ?? []) {
      const instances = generateInstancesForType(sub.type, sub.annee, {
        jour_cloture: client.jour_cloture,
        mois_cloture: client.mois_cloture,
      });
      if (!instances.length) continue;

      const { data: existing, error: e2 } = await sb
        .from('obligations')
        .select('id, periode, echeance')
        .eq('subscription_id', sub.id);
      if (e2) {
        console.error(`Erreur existing ${client.denomination} ${sub.type}:`, e2.message);
        continue;
      }
      const existingMap = new Map((existing ?? []).map((r) => [r.periode, r]));

      const toInsert: Array<Record<string, unknown>> = [];
      for (const i of instances) {
        const ex = existingMap.get(i.periode);
        if (ex) {
          if (ex.echeance !== i.echeance) {
            const { error } = await sb
              .from('obligations')
              .update({ echeance: i.echeance })
              .eq('id', ex.id);
            if (!error) totalUpdated++;
          }
        } else {
          toInsert.push({
            subscription_id: sub.id,
            client_id: client.id,
            type: sub.type,
            periode: i.periode,
            annee: i.annee,
            echeance: i.echeance,
          });
        }
      }
      if (toInsert.length) {
        const { error } = await sb.from('obligations').insert(toInsert);
        if (!error) totalInserted += toInsert.length;
        else console.error(`Erreur insert ${client.denomination} ${sub.type}:`, error.message);
      }
    }
  }

  console.log(`\nÉchéances créées : ${totalInserted}`);
  console.log(`Échéances mises à jour : ${totalUpdated}`);
  console.log('Terminé.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
