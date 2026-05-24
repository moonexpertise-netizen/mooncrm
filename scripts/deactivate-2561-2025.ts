/**
 * One-shot cleanup batch :
 *  1. Désactive 2561 + 2777 en 2025 SAUF JYVENTURES & ROUCH CAPITAL HOLDING
 *  2. Désactive OSS en 2026 SAUF CONCEPTCORE
 */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Cleanup = {
  label: string;
  types: string[];
  annee: number;
  keepPatterns: string[]; // ILIKE patterns to keep ACTIVE
};

const CLEANUPS: Cleanup[] = [
  {
    label: "2561 + 2777 en 2025",
    types: ["DECL_2561", "DECL_2777"],
    annee: 2025,
    keepPatterns: ["%JYVENTURES%", "%ROUCH CAPITAL%"],
  },
  {
    label: "OSS en 2026",
    types: ["OSS"],
    annee: 2026,
    keepPatterns: ["%CONCEPTCORE%"],
  },
];

async function runCleanup(c: Cleanup) {
  console.log(`\n→ ${c.label}`);

  const orQuery = c.keepPatterns.map((p) => `denomination.ilike.${p}`).join(",");
  const { data: keep } = await sb
    .from("clients")
    .select("id, denomination")
    .or(orQuery);
  const keepIds = new Set((keep ?? []).map((k) => k.id));
  console.log(
    `   Préservés : ${(keep ?? []).map((k) => k.denomination).join(", ") || "(aucun trouvé)"}`
  );

  const { data: subs } = await sb
    .from("obligation_subscriptions")
    .select("id, client_id, type")
    .in("type", c.types)
    .eq("annee", c.annee)
    .eq("actif", true);

  const toDeactivate = (subs ?? []).filter((s) => !keepIds.has(s.client_id));
  console.log(`   Subs actives concernées : ${subs?.length ?? 0}`);
  console.log(`   À désactiver : ${toDeactivate.length}`);

  if (toDeactivate.length === 0) return;

  const ids = toDeactivate.map((s) => s.id);
  const { error } = await sb
    .from("obligation_subscriptions")
    .update({ actif: false })
    .in("id", ids);
  if (error) throw new Error(error.message);

  const stats = toDeactivate.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`   ✓ ${Object.entries(stats).map(([t, n]) => `${t} ×${n}`).join(", ")}`);
}

async function main() {
  for (const c of CLEANUPS) await runCleanup(c);
  console.log("\nTerminé.");
}

main().catch((e) => {
  console.error("Erreur :", e);
  process.exit(1);
});
