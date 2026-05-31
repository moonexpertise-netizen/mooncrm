"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Compteurs pour les badges rouges de la sidebar : nombre de dossiers
 * actuellement en statut "A faire" sur les modules Creations / IR + IFI / CAA.
 *
 *   - Creations : clients origine='1 - Création' avec creation_statut='a_traiter'
 *   - IR + IFI  : ir_obligations annee=courante avec statut_logique='A_FAIRE'
 *                 (compte les cells IR ET IFI separement -> chaque dossier
 *                  non commence compte 1 par type)
 *   - CAA       : caa_obligations annee=courante avec statut_logique='A_FAIRE'
 *
 * Production : exclu (trop de tasks, polluerait visuellement).
 *
 * Defensif : si une colonne / table manque (migration pas appliquee), le count
 * tombe a 0 silencieusement.
 */
export async function loadSidebarBadges(): Promise<{
  creations: number;
  ir: number;
  caa: number;
}> {
  const sb = await createClient();
  const currentYear = new Date().getFullYear();

  const [creationsRes, irRes, caaRes] = await Promise.all([
    sb
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("origine", "1 - Création")
      .eq("creation_statut", "a_traiter"),
    sb
      .from("ir_obligations")
      .select("id", { count: "exact", head: true })
      .eq("annee", currentYear)
      .eq("statut_logique", "A_FAIRE"),
    sb
      .from("caa_obligations")
      .select("id", { count: "exact", head: true })
      .eq("annee", currentYear)
      .eq("statut_logique", "A_FAIRE"),
  ]);

  return {
    creations: creationsRes.error ? 0 : creationsRes.count ?? 0,
    ir: irRes.error ? 0 : irRes.count ?? 0,
    caa: caaRes.error ? 0 : caaRes.count ?? 0,
  };
}
