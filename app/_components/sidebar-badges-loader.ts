"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Compteurs pour les badges rouges de la sidebar : nombre de dossiers
 * actuellement en statut "A faire" sur les modules Creations / IR + IFI / CAA.
 *
 *   - Creations : clients origine='1 - Création' avec creation_statut='a_traiter'
 *   - IR + IFI  : ir_obligations statut_logique='A_FAIRE' toutes annees
 *                 (compte les cells IR ET IFI separement -> chaque type non
 *                 commence compte 1)
 *   - CAA       : caa_obligations statut_logique='A_FAIRE' toutes annees
 *
 * NB : on ne filtre pas sur l'annee courante. Un exercice 2025 declare en
 * 2026 reste "a faire" tant que pas termine. Le badge compte la dette
 * operationnelle reelle, pas un slice annuel.
 *
 * Production : exclu (trop de tasks, polluerait visuellement).
 *
 * Defensif : log + count=0 si la query echoue (colonne manquante / RLS / etc.)
 */
export async function loadSidebarBadges(): Promise<{
  creations: number;
  ir: number;
  caa: number;
  facturation: number;
}> {
  const sb = await createClient();

  const [
    creationsRes,
    irRes,
    caaRes,
    // Facturation : 6 sources cumulees (AGO et LIASSE separes pour les filtres
    // metier specifiques cf. page /facturation)
    factAgoRes,
    factLiasseRes,
    factCaaRes,
    factIrRes,
    factMissionExcRes,
    factCreationsRes,
  ] = await Promise.all([
    sb
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("origine", "1 - Création")
      .eq("creation_statut", "a_traiter"),
    // IR : chaque (client, annee) a 2 lignes en DB (IR + IFI) -> on compte les
    // dossiers uniques. count(exact, head) ne permet pas de count distinct, on
    // recupere les paires (client_ir_id, annee) et on dedup cote JS.
    sb
      .from("ir_obligations")
      .select("client_ir_id, annee")
      .eq("statut_logique", "A_FAIRE"),
    sb
      .from("caa_obligations")
      .select("id", { count: "exact", head: true })
      .eq("statut_logique", "A_FAIRE"),
    // ============================================================
    // Facturation : on filtre comme la page /facturation pour eviter
    // les fantomes. Une ligne n'est REELLEMENT a facturer que si :
    //   1. Le statut metier est terminal (TERMINE / livree / actee_kbis_recu)
    //   2. ET etat_facturation = 'a_facturer'
    // Sans la condition 1, on comptait des items en a_facturer dont le
    // statut metier n'est pas encore termine -> compteur > KPI page.
    // ============================================================
    // 1a) AGO depot : TERMINE + (a_facturer OR null). On accepte null car la
    // page Facturation considere "null = pas encore decide = a facturer par
    // defaut" (cf. /facturation/page.tsx ligne 360-362).
    sb
      .from("obligations")
      .select("id", { count: "exact", head: true })
      .eq("type", "AGO_DEPOT")
      .eq("statut_logique", "TERMINE")
      .or("etat_facturation.eq.a_facturer,etat_facturation.is.null"),
    // 1b) LIASSE_PLAQUETTE : TERMINE + (a_facturer OR null) + client avec
    // type_honos_bilans = 'Facturés' (sinon bilan inclus dans le forfait EC).
    sb
      .from("obligations")
      .select("id, clients!inner(type_honos_bilans)", { count: "exact", head: true })
      .eq("type", "LIASSE_PLAQUETTE")
      .eq("statut_logique", "TERMINE")
      .or("etat_facturation.eq.a_facturer,etat_facturation.is.null")
      .eq("clients.type_honos_bilans", "Facturés"),
    // 2) CAA terminees + (a_facturer OR null)
    sb
      .from("caa_obligations")
      .select("id", { count: "exact", head: true })
      .eq("statut_logique", "TERMINE")
      .or("etat_facturation.eq.a_facturer,etat_facturation.is.null"),
    // 3) IR / IFI terminees + a facturer. Idem que ci-dessus : 2 lignes par
    // dossier en DB, dedup cote JS pour matcher la page Facturation qui
    // agrege par client+annee.
    sb
      .from("ir_obligations")
      .select("client_ir_id, annee")
      .eq("statut_logique", "TERMINE")
      .or("etat_facturation.eq.a_facturer,etat_facturation.is.null"),
    // 4) missions exc livrees + a facturer
    sb
      .from("missions_exceptionnelles")
      .select("id", { count: "exact", head: true })
      .eq("etat_mission", "livree")
      .eq("etat_facturation", "a_facturer"),
    // 5) creations : KBIS reçu + a facturer
    sb
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("creation_statut", "actee_kbis_recu")
      .eq("creation_facturation", "a_facturer"),
  ]);

  if (creationsRes.error) {
    // eslint-disable-next-line no-console
    console.error("[sidebar-badges] creations:", creationsRes.error.message);
  }
  if (irRes.error) {
    // eslint-disable-next-line no-console
    console.error("[sidebar-badges] ir:", irRes.error.message);
  }
  if (caaRes.error) {
    // eslint-disable-next-line no-console
    console.error("[sidebar-badges] caa:", caaRes.error.message);
  }

  // IR : dedup par (client_ir_id, annee) car chaque dossier a 2 lignes
  // (IR + IFI) en DB. Le badge "A faire" compte les dossiers, pas les lignes.
  function dedupIrRows(
    rows: Array<{ client_ir_id: string; annee: number }> | null,
  ): number {
    if (!rows) return 0;
    const seen = new Set<string>();
    for (const r of rows) seen.add(`${r.client_ir_id}|${r.annee}`);
    return seen.size;
  }
  const irCount = irRes.error
    ? 0
    : dedupIrRows(irRes.data as Array<{ client_ir_id: string; annee: number }>);

  // Facturation : on log les erreurs mais on continue avec count=0 sur les
  // sources qui plantent (defensif si une table manque ou si RLS bloque).
  // IR a un traitement special : dedup par (client_ir_id, annee).
  const factSources: Array<{
    name: string;
    res: { error: { message: string } | null; count?: number | null };
  }> = [
    { name: "ago", res: factAgoRes },
    { name: "liasse", res: factLiasseRes },
    { name: "caa", res: factCaaRes },
    { name: "missions_exc", res: factMissionExcRes },
    { name: "creations", res: factCreationsRes },
  ];
  let facturation = 0;
  for (const { name, res } of factSources) {
    if (res.error) {
      // eslint-disable-next-line no-console
      console.error(`[sidebar-badges] facturation/${name}:`, res.error.message);
    } else {
      facturation += res.count ?? 0;
    }
  }
  if (factIrRes.error) {
    // eslint-disable-next-line no-console
    console.error("[sidebar-badges] facturation/ir:", factIrRes.error.message);
  } else {
    facturation += dedupIrRows(
      factIrRes.data as Array<{ client_ir_id: string; annee: number }>,
    );
  }

  return {
    creations: creationsRes.error ? 0 : creationsRes.count ?? 0,
    ir: irCount,
    caa: caaRes.error ? 0 : caaRes.count ?? 0,
    facturation,
  };
}
