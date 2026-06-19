/**
 * Diagnostic ciblé : pour les clients vus "en retard" sur la TVA mensuelle,
 * regarde si une obligation existe en base et son statut. Lecture seule.
 * Usage : npx tsx scripts/diag-tva.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.local", "utf8");
const env: Record<string, string> = {};
for (const line of envFile.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i === -1) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NAMES = [
  "ADELEX CONSULTING",
  "BRUNOMARTIN SOLUTIONS",
  "MOON EXPERTISE",
  "COREONE",
];

async function main() {
  // Formats de periode distincts pour TVA_MENSUELLE (détecte un décalage).
  const { data: allObl } = await sb
    .from("obligations")
    .select("periode")
    .eq("type", "TVA_MENSUELLE")
    .limit(5000);
  const formats = new Map<string, number>();
  for (const o of allObl ?? []) {
    const f = /^\d{4}-\d{2}$/.test(o.periode) ? "YYYY-MM (ok)" : `AUTRE: ${o.periode}`;
    formats.set(f, (formats.get(f) ?? 0) + 1);
  }
  console.log("=== Formats de periode TVA_MENSUELLE en base ===");
  for (const [f, n] of [...formats.entries()].sort()) console.log(`  ${f.padEnd(20)} ${n}`);

  for (const name of NAMES) {
    const { data: clients } = await sb
      .from("clients")
      .select("id, denomination, pipeline_statut")
      .ilike("denomination", `%${name}%`)
      .limit(1);
    const c = clients?.[0];
    if (!c) { console.log(`\n### ${name} : INTROUVABLE`); continue; }
    console.log(`\n### ${c.denomination}  (pipeline=${c.pipeline_statut})`);

    const { data: subs } = await sb
      .from("obligation_subscriptions")
      .select("annee, actif")
      .eq("client_id", c.id)
      .eq("type", "TVA_MENSUELLE")
      .order("annee");
    console.log("  Subs TVA_MENSUELLE :", (subs ?? []).map((s) => `${s.annee}${s.actif ? "" : "(inactif)"}`).join(", ") || "AUCUNE");

    const { data: obls } = await sb
      .from("obligations")
      .select("periode, annee, statut_logique, statut_detail")
      .eq("client_id", c.id)
      .eq("type", "TVA_MENSUELLE")
      .gte("annee", 2025)
      .order("periode");
    console.log(`  Obligations TVA en base (${(obls ?? []).length}) :`);
    for (const o of obls ?? []) {
      console.log(`     ${o.periode}  [annee ${o.annee}]  ${o.statut_logique}  «${o.statut_detail ?? ""}»`);
    }
    // Focus : décembre 2025, janvier 2026, février 2026 (les "en retard" vus)
    for (const p of ["2025-12", "2026-01", "2026-02"]) {
      const row = (obls ?? []).find((o) => o.periode === p);
      console.log(`     -> ${p} : ${row ? row.statut_logique : "AUCUNE LIGNE (placeholder => 'À faire')"}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
