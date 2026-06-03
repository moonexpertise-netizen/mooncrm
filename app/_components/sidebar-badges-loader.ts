"use server";

import { createClient } from "@/lib/supabase/server";

const ZERO = { creations: 0, ir: 0, caa: 0 } as const;

/**
 * Compteurs pour les badges rouges de la sidebar : nombre de dossiers
 * actuellement en statut "A faire" sur les modules Creations / IR + IFI / CAA.
 *
 * ULTRA-DEFENSIVE : cette server action est appelee par le sidebar a chaque
 * navigation. Si elle throw, le client recoit une 500 et le composant React
 * peut crasher avec "An error occurred in the Server Components render".
 *
 * Garantie : cette fonction ne throw JAMAIS, peu importe ce qui se passe.
 *   - createClient throw (cookies cassees, session expiree) -> return ZERO
 *   - Supabase indisponible -> return ZERO
 *   - Colonnes/tables manquantes -> return ZERO
 *
 * Production : exclu des badges (trop de tasks, polluerait visuellement).
 */
export async function loadSidebarBadges(): Promise<{
  creations: number;
  ir: number;
  caa: number;
}> {
  try {
    const sb = await createClient();

    // Chaque query dans son propre try : un echec n'empeche pas les 2 autres.
    // PromiseLike pour accepter les Postgrest builders (thenable mais pas
    // strictement Promise).
    async function safeCount(fn: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
      try {
        const r = await fn();
        if (r.error) {
          // eslint-disable-next-line no-console
          console.error("[sidebar-badges] query error:", r.error);
          return 0;
        }
        return r.count ?? 0;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[sidebar-badges] query throw:", e);
        return 0;
      }
    }

    const [creations, ir, caa] = await Promise.all([
      safeCount(() =>
        sb
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("origine", "1 - Création")
          .eq("creation_statut", "a_traiter")
      ),
      safeCount(() =>
        sb
          .from("ir_obligations")
          .select("id", { count: "exact", head: true })
          .eq("statut_logique", "A_FAIRE")
      ),
      safeCount(() =>
        sb
          .from("caa_obligations")
          .select("id", { count: "exact", head: true })
          .eq("statut_logique", "A_FAIRE")
      ),
    ]);

    return { creations, ir, caa };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sidebar-badges] fatal:", e);
    return { ...ZERO };
  }
}
