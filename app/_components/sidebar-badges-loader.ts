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
    // Facturation : 5 sources cumulees (toutes filtrees etat_facturation = 'a_facturer')
    factObligationsRes,
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
    sb
      .from("ir_obligations")
      .select("id", { count: "exact", head: true })
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
    // 1) obligations (AGO_DEPOT + LIASSE_PLAQUETTE) terminees + a facturer
    sb
      .from("obligations")
      .select("id", { count: "exact", head: true })
      .in("type", ["AGO_DEPOT", "LIASSE_PLAQUETTE"])
      .eq("statut_logique", "TERMINE")
      .eq("etat_facturation", "a_facturer"),
    // 2) CAA terminees + a facturer
    sb
      .from("caa_obligations")
      .select("id", { count: "exact", head: true })
      .eq("statut_logique", "TERMINE")
      .eq("etat_facturation", "a_facturer"),
    // 3) IR / IFI terminees + a facturer
    sb
      .from("ir_obligations")
      .select("id", { count: "exact", head: true })
      .eq("statut_logique", "TERMINE")
      .eq("etat_facturation", "a_facturer"),
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
  // Facturation : on log les erreurs mais on continue avec count=0 sur les
  // sources qui plantent (defensif si une table manque ou si RLS bloque)
  const factSources = [
    { name: "obligations", res: factObligationsRes },
    { name: "caa", res: factCaaRes },
    { name: "ir", res: factIrRes },
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

  return {
    creations: creationsRes.error ? 0 : creationsRes.count ?? 0,
    ir: irRes.error ? 0 : irRes.count ?? 0,
    caa: caaRes.error ? 0 : caaRes.count ?? 0,
    facturation,
  };
}
