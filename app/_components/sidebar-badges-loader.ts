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
}> {
  const sb = await createClient();

  const [creationsRes, irRes, caaRes] = await Promise.all([
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

  return {
    creations: creationsRes.error ? 0 : creationsRes.count ?? 0,
    ir: irRes.error ? 0 : irRes.count ?? 0,
    caa: caaRes.error ? 0 : caaRes.count ?? 0,
  };
}
