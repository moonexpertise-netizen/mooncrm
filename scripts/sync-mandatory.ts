/**
 * Backfill des obligations systématiques :
 *   - CFE : toujours active pour tout (client, année) qui a au moins une autre
 *     sub active.
 *   - IS_SOLDE et IS_ACOMPTE : actifs si régime IS pour cette année
 *     (lu depuis client_year_config). Plus exposés dans l'UI.
 *   - IS_SOLDE et IS_ACOMPTE : forcés inactifs si régime IR (sinon résidus
 *     anciens import / régime modifié avant la règle).
 *
 * Idempotent.
 *
 * Lancement : `npm run sync-mandatory`
 */

import { createClient } from '@supabase/supabase-js';
import { generateInstancesForType } from '../lib/obligations-engine';
import type { TypeObligation } from '../app/clients/[slug]/actions';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureActive(clientId: string, type: string, annee: number): Promise<boolean> {
  const { data: existing } = await sb
    .from('obligation_subscriptions')
    .select('id, actif')
    .eq('client_id', clientId)
    .eq('type', type)
    .eq('annee', annee)
    .maybeSingle();
  if (existing) {
    if (!existing.actif) {
      await sb.from('obligation_subscriptions').update({ actif: true }).eq('id', existing.id);
      return true;
    }
    return false;
  } else {
    await sb.from('obligation_subscriptions').insert({ client_id: clientId, type, annee, actif: true });
    return true;
  }
}

async function generateForSub(clientId: string, subType: string, annee: number) {
  const { data: client } = await sb
    .from('clients')
    .select('jour_cloture, mois_cloture')
    .eq('id', clientId)
    .single();
  if (!client) return;

  const { data: sub } = await sb
    .from('obligation_subscriptions')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', subType)
    .eq('annee', annee)
    .eq('actif', true)
    .single();
  if (!sub) return;

  const instances = generateInstancesForType(subType as TypeObligation, annee, {
    jour_cloture: client.jour_cloture,
    mois_cloture: client.mois_cloture,
  });
  if (!instances.length) return;

  const { data: existing } = await sb
    .from('obligations')
    .select('id, periode')
    .eq('subscription_id', sub.id);
  const existingPeriodes = new Set((existing ?? []).map((r) => r.periode));

  const toInsert = instances
    .filter((i) => !existingPeriodes.has(i.periode))
    .map((i) => ({
      subscription_id: sub.id,
      client_id: clientId,
      type: subType,
      periode: i.periode,
      annee: i.annee,
      echeance: i.echeance,
    }));
  if (toInsert.length) {
    await sb.from('obligations').insert(toInsert);
  }
}

async function main() {
  console.log('\n=== Sync obligations systématiques ===\n');

  // 1. Trouver les (client, année) qui ont au moins une sub active
  const { data: activeSubs, error: e0 } = await sb
    .from('obligation_subscriptions')
    .select('client_id, annee')
    .eq('actif', true);
  if (e0) throw new Error(e0.message);

  const yearsByClient = new Set<string>();
  for (const r of activeSubs ?? []) yearsByClient.add(`${r.client_id}|${r.annee}`);

  console.log(`1. CFE pour ${yearsByClient.size} (client × année)...`);
  let cfeAdded = 0;
  for (const key of yearsByClient) {
    const [clientId, anneeStr] = key.split('|');
    const annee = parseInt(anneeStr, 10);
    const added = await ensureActive(clientId, 'CFE', annee);
    if (added) {
      cfeAdded++;
      await generateForSub(clientId, 'CFE', annee);
    }
  }
  console.log(`   -> ${cfeAdded} sub(s) CFE activée(s)\n`);

  // 2. IS_SOLDE pour tous les (client, année) avec régime IS
  const { data: isConfigs, error: e1 } = await sb
    .from('client_year_config')
    .select('client_id, annee')
    .eq('regime', 'IS');
  if (e1) throw new Error(e1.message);

  console.log(`2. IS_SOLDE + IS_ACOMPTE pour ${isConfigs?.length ?? 0} (client × année) en régime IS...`);
  let isAdded = 0;
  for (const c of isConfigs ?? []) {
    for (const type of ['IS_SOLDE', 'IS_ACOMPTE'] as const) {
      const added = await ensureActive(c.client_id, type, c.annee);
      if (added) {
        isAdded++;
        await generateForSub(c.client_id, type, c.annee);
      }
    }
  }
  console.log(`   -> ${isAdded} sub(s) IS activée(s)\n`);

  // 3. IR : désactive IS_ACOMPTE + IS_SOLDE résiduels
  const { data: irConfigs, error: e2 } = await sb
    .from('client_year_config')
    .select('client_id, annee')
    .eq('regime', 'IR');
  if (e2) throw new Error(e2.message);

  console.log(`3. IS_* forcés inactifs pour ${irConfigs?.length ?? 0} (client × année) en régime IR...`);
  let irCleaned = 0;
  for (const c of irConfigs ?? []) {
    const { data, error } = await sb
      .from('obligation_subscriptions')
      .update({ actif: false })
      .eq('client_id', c.client_id)
      .eq('annee', c.annee)
      .in('type', ['IS_ACOMPTE', 'IS_SOLDE'])
      .eq('actif', true)
      .select('id');
    if (error) throw new Error(error.message);
    if (data) irCleaned += data.length;
  }
  console.log(`   -> ${irCleaned} sub(s) IS désactivée(s) sur des dossiers IR\n`);

  // 4. Désactive toute sub dont l'année est antérieure au debut_obligations
  const { data: clientsWithDebut, error: e3 } = await sb
    .from('clients')
    .select('id, denomination, debut_obligations')
    .not('debut_obligations', 'is', null);
  if (e3) throw new Error(e3.message);

  console.log(`4. Nettoyage subs antérieures à debut_obligations (${clientsWithDebut?.length ?? 0} clients concernés)...`);
  let beforeDebutCleaned = 0;
  for (const c of clientsWithDebut ?? []) {
    const debutYear = parseInt(String(c.debut_obligations).slice(0, 4), 10);
    if (Number.isNaN(debutYear)) continue;
    // Compte d'abord (pour le log) puis update
    const { count } = await sb
      .from('obligation_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', c.id)
      .lt('annee', debutYear)
      .eq('actif', true);
    if (!count) continue;
    const { error } = await sb
      .from('obligation_subscriptions')
      .update({ actif: false })
      .eq('client_id', c.id)
      .lt('annee', debutYear)
      .eq('actif', true);
    if (error) throw new Error(error.message);
    beforeDebutCleaned += count;
  }
  console.log(`   -> ${beforeDebutCleaned} sub(s) désactivée(s) (annee < debut_obligations)\n`);

  console.log('Terminé.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
