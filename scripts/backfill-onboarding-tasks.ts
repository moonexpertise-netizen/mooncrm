/**
 * Backfill des tâches d'onboarding pour tous les clients existants.
 *
 * Lit le parcours par défaut + ses étapes (depuis la DB), puis pour chaque
 * client facturable (LDM signée / interne / sous-traitance), crée les
 * tâches manquantes :
 *   - Si une condition_na matche le client → tâche en NON_APPLICABLE (gris)
 *   - Sinon → tâche en A_FAIRE
 *
 * Idempotent : ne re-crée pas une tâche déjà existante pour un client.
 * Utile quand on ajoute une nouvelle étape dans le parcours (genre "Création")
 * et qu'on veut l'appliquer rétroactivement.
 *
 * Lancement : npm run backfill-onboarding
 */

import { createClient } from "@supabase/supabase-js";
import { shouldBeNa, type ClientContext } from "../app/onboarding/parcours-engine";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Variables manquantes : NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Categorie = "2G" | "2C" | "2R" | "2T";

// Critère "facturable" : même règle que isClientBillable (lib/billable.ts).
// On accepte LDM signée + statuts Z internes / sous-traitance.
const BILLABLE_PIPELINES = new Set([
  "7 - LDM signée",
  "Z - Interne",
  "Z - Sous-traitance",
]);

async function main() {
  console.log("\n=== Backfill onboarding tasks ===\n");

  // 1. Parcours par défaut + étapes
  const { data: parcours, error: e0 } = await sb
    .from("onboarding_parcours")
    .select("id, onboarding_etape(task_key, libelle, ordre, categorie, conditions_na)")
    .eq("is_default", true)
    .order("ordre", { foreignTable: "onboarding_etape", ascending: true })
    .maybeSingle();
  if (e0) {
    console.error("Erreur parcours :", e0.message);
    process.exit(1);
  }
  if (!parcours) {
    console.error("Aucun parcours par défaut configuré.");
    process.exit(1);
  }
  const etapes = (parcours.onboarding_etape ?? []) as Array<{
    task_key: string;
    libelle: string;
    ordre: number;
    categorie: string | null;
    conditions_na: unknown;
  }>;
  console.log(`Parcours par défaut : ${etapes.length} étapes`);

  // 2. Libellés par défaut depuis status_options
  const taskKeys = etapes.map((e) => e.task_key);
  const { data: defaults } = taskKeys.length
    ? await sb
        .from("status_options")
        .select("type_code, libelle, statut_logique, ordre")
        .eq("scope", "onboarding")
        .eq("actif", true)
        .in("type_code", taskKeys)
        .order("ordre")
    : { data: [] };
  const defaultLibelleByKey = new Map<string, { a_faire: string | null; na: string | null }>();
  for (const d of defaults ?? []) {
    const entry = defaultLibelleByKey.get(d.type_code) ?? { a_faire: null, na: null };
    if (d.statut_logique === "A_FAIRE" && !entry.a_faire) entry.a_faire = d.libelle;
    if (d.statut_logique === "NON_APPLICABLE" && !entry.na) entry.na = d.libelle;
    defaultLibelleByKey.set(d.type_code, entry);
  }

  // 3. Tous les clients facturables
  const { data: clients, error: e1 } = await sb
    .from("clients")
    .select("id, denomination, origine, gestion_tns, forme, activite, pipeline_statut");
  if (e1) {
    console.error("Erreur clients :", e1.message);
    process.exit(1);
  }
  const billable = (clients ?? []).filter((c) =>
    BILLABLE_PIPELINES.has(c.pipeline_statut ?? "")
  );
  console.log(`Clients facturables : ${billable.length} / ${clients?.length ?? 0}`);

  // 4. Pour chaque client, on regarde les tâches déjà créées
  let totalCreated = 0;
  let totalNa = 0;
  let totalAFaire = 0;
  let skippedExisting = 0;

  for (const c of billable) {
    const { data: existing } = await sb
      .from("onboarding_tasks")
      .select("task_key")
      .eq("client_id", c.id);
    const existingSet = new Set((existing ?? []).map((t) => t.task_key));

    const ctx: ClientContext = {
      origine: c.origine,
      gestion_tns: c.gestion_tns,
      forme: c.forme,
      activite: c.activite,
    };

    const toInsert: Array<{
      client_id: string;
      task_key: string;
      categorie: Categorie;
      statut_logique: "A_FAIRE" | "NON_APPLICABLE";
      statut_detail: string | null;
    }> = [];

    for (const etape of etapes) {
      if (existingSet.has(etape.task_key)) {
        skippedExisting++;
        continue;
      }
      const cat = (etape.categorie as Categorie) || "2G";
      const isNa = shouldBeNa(etape.conditions_na, ctx);
      const labels = defaultLibelleByKey.get(etape.task_key) ?? { a_faire: null, na: null };

      if (isNa) {
        toInsert.push({
          client_id: c.id,
          task_key: etape.task_key,
          categorie: cat,
          statut_logique: "NON_APPLICABLE",
          statut_detail: labels.na ?? "Non applicable",
        });
        totalNa++;
      } else {
        toInsert.push({
          client_id: c.id,
          task_key: etape.task_key,
          categorie: cat,
          statut_logique: "A_FAIRE",
          statut_detail: labels.a_faire ?? null,
        });
        totalAFaire++;
      }
    }

    if (toInsert.length > 0) {
      const { error } = await sb.from("onboarding_tasks").insert(toInsert);
      if (error) {
        console.error(`  ! Erreur insert ${c.denomination} : ${error.message}`);
      } else {
        totalCreated += toInsert.length;
        console.log(`  ✓ ${c.denomination} : +${toInsert.length} tâches (${toInsert.filter((t) => t.statut_logique === "NON_APPLICABLE").length} N/A)`);
      }
    }
  }

  console.log("\n=== Résumé ===");
  console.log(`Tâches créées : ${totalCreated}`);
  console.log(`  - À faire : ${totalAFaire}`);
  console.log(`  - Non applicable (gris) : ${totalNa}`);
  console.log(`Tâches déjà existantes (skippées) : ${skippedExisting}`);
  console.log("\nFini.\n");
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(1);
});
