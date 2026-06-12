"use server";

import { createClient } from "@/lib/supabase/server";
import { filterByDebut, generateInstancesForType } from "@/lib/obligations-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

type TypeObligation =
  | "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS"
  | "TVS"
  | "IS_ACOMPTE" | "IS_SOLDE"
  | "CVAE" | "CVAE_ACOMPTE"
  | "CFE"
  | "DAS2" | "DECL_2561" | "DECL_2777" | "OSS" | "DES"
  | "COMPTA" | "LIASSE_PLAQUETTE" | "AGO_DEPOT" | "DEPOT_COMPTES"
  | "FACTURATION_JUR" | "ETAT_CREATION";

type Regime = "IR" | "IS";
type TvaMode = "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS";

/**
 * Regen ciblé : génère les instances d'UNE sub précise, avec INSERT/UPDATE
 * parallélisés via Promise.all. Beaucoup plus rapide que regenForClient
 * (qui itère sur toutes les subs du client).
 */
async function regenForSub(
  sb: SupabaseClient,
  clientId: string,
  type: TypeObligation,
  annee: number
) {
  const [{ data: client }, { data: sub }] = await Promise.all([
    sb.from("clients").select("jour_cloture, mois_cloture, debut_obligations").eq("id", clientId).single(),
    sb
      .from("obligation_subscriptions")
      .select("id")
      .eq("client_id", clientId)
      .eq("type", type)
      .eq("annee", annee)
      .eq("actif", true)
      .maybeSingle(),
  ]);
  if (!client || !sub) return;

  const instances = filterByDebut(
    generateInstancesForType(type, annee, {
      jour_cloture: client.jour_cloture,
      mois_cloture: client.mois_cloture,
    }),
    client.debut_obligations
  );
  if (!instances.length) return;

  const { data: existing } = await sb
    .from("obligations")
    .select("id, periode, echeance")
    .eq("subscription_id", sub.id);
  const existingMap = new Map((existing ?? []).map((r) => [r.periode, r]));

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; echeance: string | null }[] = [];
  for (const i of instances) {
    const ex = existingMap.get(i.periode);
    if (ex) {
      if (ex.echeance !== i.echeance) toUpdate.push({ id: ex.id, echeance: i.echeance });
    } else {
      toInsert.push({
        subscription_id: sub.id,
        client_id: clientId,
        type,
        periode: i.periode,
        annee: i.annee,
        echeance: i.echeance,
      });
    }
  }

  // Parallélise insert + tous les updates
  await Promise.all([
    toInsert.length ? sb.from("obligations").insert(toInsert) : Promise.resolve(),
    ...toUpdate.map((u) =>
      sb.from("obligations").update({ echeance: u.echeance }).eq("id", u.id)
    ),
  ]);
}

/**
 * Active ou désactive (soft) une obligation pour un client × année.
 * Revalidation ciblée (pas de "layout" coûteux).
 */
export async function setSubActive(
  clientId: string,
  type: TypeObligation,
  annee: number,
  active: boolean
) {
  const sb = await createClient();
  const { data: existing } = await sb
    .from("obligation_subscriptions")
    .select("id")
    .eq("client_id", clientId)
    .eq("type", type)
    .eq("annee", annee)
    .maybeSingle();

  if (existing) {
    await sb.from("obligation_subscriptions").update({ actif: active }).eq("id", existing.id);
  } else if (active) {
    await sb
      .from("obligation_subscriptions")
      .insert({ client_id: clientId, type, annee, actif: true });
  }

  if (active) await regenForSub(sb, clientId, type, annee);
  // Perf : optimistic update côté grid. Pas de revalidatePath.
}

/**
 * Définit le mode TVA (mutuellement exclusif) pour un client × année.
 */
export async function setTva(
  clientId: string,
  annee: number,
  mode: TvaMode | null
) {
  const sb = await createClient();
  const all: TvaMode[] = ["TVA_MENSUELLE", "TVA_TRIMESTRIELLE", "TVA_ANNUELLE_CA12", "TVA_NON_SOUMIS"];
  const toDeactivate = all.filter((m) => m !== mode);

  await sb
    .from("obligation_subscriptions")
    .update({ actif: false })
    .eq("client_id", clientId)
    .eq("annee", annee)
    .in("type", toDeactivate);

  if (mode) {
    const { data: ex } = await sb
      .from("obligation_subscriptions")
      .select("id")
      .eq("client_id", clientId)
      .eq("type", mode)
      .eq("annee", annee)
      .maybeSingle();
    if (ex) {
      await sb.from("obligation_subscriptions").update({ actif: true }).eq("id", ex.id);
    } else {
      await sb
        .from("obligation_subscriptions")
        .insert({ client_id: clientId, type: mode, annee, actif: true });
    }
    await regenForSub(sb, clientId, mode, annee);
  }
  // Perf : optimistic update côté grid. Pas de revalidatePath.
}

/**
 * Définit le régime IR/IS pour un client × année.
 */
export async function setRegimeAction(
  clientId: string,
  annee: number,
  regime: Regime | null
) {
  const sb = await createClient();
  await sb
    .from("client_year_config")
    .upsert({ client_id: clientId, annee, regime }, { onConflict: "client_id,annee" });

  if (regime === "IR") {
    await sb
      .from("obligation_subscriptions")
      .update({ actif: false })
      .eq("client_id", clientId)
      .eq("annee", annee)
      .in("type", ["IS_ACOMPTE", "IS_SOLDE", "CVAE", "CVAE_ACOMPTE"]);
  } else if (regime === "IS") {
    // Auto-active IS_SOLDE, IS_ACOMPTE, CVAE et CVAE_ACOMPTE : toujours
    // obligatoires en régime IS. Si l'entreprise n'est pas concernée par
    // la CVAE (CA < seuil ou CVAE N-1 < 1 500 €), elle pose un libellé
    // "N/A" sur la ligne CVAE directement dans le tracker.
    for (const t of ["IS_SOLDE", "IS_ACOMPTE", "CVAE", "CVAE_ACOMPTE"] as const) {
      const { data: ex } = await sb
        .from("obligation_subscriptions")
        .select("id")
        .eq("client_id", clientId)
        .eq("type", t)
        .eq("annee", annee)
        .maybeSingle();
      if (ex) {
        await sb.from("obligation_subscriptions").update({ actif: true }).eq("id", ex.id);
      } else {
        await sb
          .from("obligation_subscriptions")
          .insert({ client_id: clientId, type: t, annee, actif: true });
      }
      await regenForSub(sb, clientId, t, annee);
    }
  }
  // Perf : optimistic update côté grid. Pas de revalidatePath.
}

/**
 * Bulk : active/désactive en parallèle pour plusieurs clients.
 */
export async function bulkSetSubActive(
  clientIds: string[],
  type: TypeObligation,
  annee: number,
  active: boolean
) {
  if (clientIds.length === 0) return { updated: 0 };
  const sb = await createClient();

  // 1. Read existing subs
  const { data: existing } = await sb
    .from("obligation_subscriptions")
    .select("id, client_id")
    .in("client_id", clientIds)
    .eq("type", type)
    .eq("annee", annee);
  const existingByClient = new Map((existing ?? []).map((s) => [s.client_id, s.id]));

  // 2. Update existing en bloc (1 query par état) + insert manquants
  const toUpdateIds = (existing ?? []).map((s) => s.id);
  const missingClientIds = clientIds.filter((id) => !existingByClient.has(id));

  await Promise.all([
    toUpdateIds.length
      ? sb.from("obligation_subscriptions").update({ actif: active }).in("id", toUpdateIds)
      : Promise.resolve(),
    active && missingClientIds.length
      ? sb.from("obligation_subscriptions").insert(
          missingClientIds.map((cid) => ({ client_id: cid, type, annee, actif: true }))
        )
      : Promise.resolve(),
  ]);

  // 3. Si activation, regen en parallèle pour tous les clients
  if (active) {
    await Promise.all(clientIds.map((cid) => regenForSub(sb, cid, type, annee)));
  }
  // Perf : optimistic update côté grid. Pas de revalidatePath.
  return { updated: clientIds.length };
}

/**
 * Désactive (soft) TOUTES les subs actives pour plusieurs clients × année,
 * en une seule requête. Conserve l'historique d'obligations.
 */
export async function bulkDeactivateAll(clientIds: string[], annee: number) {
  if (!clientIds.length) return { updated: 0 };
  const sb = await createClient();
  const { data, error } = await sb
    .from("obligation_subscriptions")
    .update({ actif: false })
    .in("client_id", clientIds)
    .eq("annee", annee)
    .eq("actif", true)
    .select("id");
  if (error) throw new Error(error.message);
  // Perf : optimistic update côté grid. Pas de revalidatePath.
  return { updated: data?.length ?? 0 };
}

/**
 * Bulk reconduction (année N → N+1) en MIROIR sur plusieurs clients.
 * L'année cible est remplacée par la config exacte de l'année source :
 *   · les subs actives en N sont activées (ou créées) en N+1
 *   · les subs actives en N+1 mais ABSENTES de N sont désactivées (soft)
 *   · le régime IR/IS est aussi reporté
 * Skip un client si son année source est vide (évite d'effacer par erreur).
 */
export async function bulkReconduire(
  clientIds: string[],
  fromYear: number,
  toYear: number
) {
  if (clientIds.length === 0) return { created: 0 };
  const sb = await createClient();

  // 1. Lit subs source
  const { data: srcSubs } = await sb
    .from("obligation_subscriptions")
    .select("client_id, type")
    .in("client_id", clientIds)
    .eq("annee", fromYear)
    .eq("actif", true);

  // Groupe par client → Set<type> source
  const sourceByClient = new Map<string, Set<string>>();
  for (const s of srcSubs ?? []) {
    if (!sourceByClient.has(s.client_id)) sourceByClient.set(s.client_id, new Set());
    sourceByClient.get(s.client_id)!.add(s.type);
  }
  // Clients ayant au moins une sub source (on évite d'écraser les autres)
  const clientsWithSource = [...sourceByClient.keys()];

  // 2. Lit subs cible
  const { data: targetSubs } = await sb
    .from("obligation_subscriptions")
    .select("id, client_id, type, actif")
    .in("client_id", clientsWithSource.length ? clientsWithSource : [""])
    .eq("annee", toYear);

  const targetMap = new Map(
    (targetSubs ?? []).map((s) => [`${s.client_id}|${s.type}`, s])
  );

  const toActivateIds: string[] = [];
  const toDeactivateIds: string[] = [];
  const toInsert: Record<string, unknown>[] = [];
  let total = 0;

  // a) Pour chaque (client, type) source → activer ou insérer en cible
  for (const [clientId, types] of sourceByClient) {
    for (const type of types) {
      const ex = targetMap.get(`${clientId}|${type}`);
      if (ex) {
        if (!ex.actif) {
          toActivateIds.push(ex.id);
          total++;
        }
      } else {
        toInsert.push({ client_id: clientId, type, annee: toYear, actif: true });
        total++;
      }
    }
  }

  // b) Pour chaque sub cible active : si son type n'est PAS dans la source
  //    du même client → on la désactive (mirror).
  for (const ts of targetSubs ?? []) {
    if (!ts.actif) continue;
    const srcTypes = sourceByClient.get(ts.client_id);
    if (srcTypes && !srcTypes.has(ts.type)) {
      toDeactivateIds.push(ts.id);
    }
  }

  // 3. Régime IR/IS source
  const { data: srcConfigs } = await sb
    .from("client_year_config")
    .select("client_id, regime")
    .in("client_id", clientsWithSource.length ? clientsWithSource : [""])
    .eq("annee", fromYear);

  await Promise.all([
    toActivateIds.length
      ? sb.from("obligation_subscriptions").update({ actif: true }).in("id", toActivateIds)
      : Promise.resolve(),
    toDeactivateIds.length
      ? sb.from("obligation_subscriptions").update({ actif: false }).in("id", toDeactivateIds)
      : Promise.resolve(),
    toInsert.length ? sb.from("obligation_subscriptions").insert(toInsert) : Promise.resolve(),
    srcConfigs?.length
      ? sb.from("client_year_config").upsert(
          srcConfigs.map((c) => ({
            client_id: c.client_id,
            annee: toYear,
            regime: c.regime,
          })),
          { onConflict: "client_id,annee" }
        )
      : Promise.resolve(),
  ]);

  // 4. Regen instances pour les subs actives en N+1
  const { data: activeNew } = await sb
    .from("obligation_subscriptions")
    .select("client_id, type")
    .in("client_id", clientsWithSource.length ? clientsWithSource : [""])
    .eq("annee", toYear)
    .eq("actif", true);

  await Promise.all(
    (activeNew ?? []).map((s) =>
      regenForSub(sb, s.client_id, s.type as TypeObligation, toYear)
    )
  );
  // Perf : la reconduction touche l'année N+1, l'utilisateur la verra au
  // prochain switch d'année (force-dynamic). Pas de revalidatePath.
  return { created: total, deactivated: toDeactivateIds.length };
}
