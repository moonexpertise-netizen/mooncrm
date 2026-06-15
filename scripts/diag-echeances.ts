/**
 * Diagnostic échéances : comprendre d'où viennent les "X en retard".
 * Lecture seule. Usage : npx tsx scripts/diag-echeances.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.local", "utf8");
const env: Record<string, string> = {};
for (const line of envFile.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAll<T>(table: string, select: string, filters?: (q: any) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    if (filters) q = filters(q);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function main() {
  // 1) Subscriptions actives par (type, annee)
  const subs = await fetchAll<any>(
    "obligation_subscriptions",
    "type, annee, actif, client_id, clients!inner(denomination, pipeline_statut, origine)",
    (q) => q.eq("actif", true)
  );
  console.log(`\n=== SUBSCRIPTIONS ACTIVES : ${subs.length} ===`);
  const byTypeYear = new Map<string, number>();
  for (const s of subs) {
    const k = `${s.type} | ${s.annee}`;
    byTypeYear.set(k, (byTypeYear.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byTypeYear.entries()].sort()) console.log(`  ${k.padEnd(28)} ${n}`);

  // 2) TVA_MENSUELLE : combien de client-années, quelles années
  const tva = subs.filter((s) => s.type === "TVA_MENSUELLE");
  const tvaByYear = new Map<number, Set<string>>();
  for (const s of tva) {
    if (!tvaByYear.has(s.annee)) tvaByYear.set(s.annee, new Set());
    tvaByYear.get(s.annee)!.add(s.client_id);
  }
  console.log(`\n=== TVA_MENSUELLE : ${tva.length} subs actives ===`);
  for (const [y, set] of [...tvaByYear.entries()].sort()) {
    console.log(`  année ${y} : ${set.size} clients × 12 mois = ${set.size * 12} cellules attendues`);
  }

  // 3) Pipeline statut des clients ayant une sub TVA_MENSUELLE
  const tvaClients = new Map<string, any>();
  for (const s of tva) tvaClients.set(s.client_id, s.clients);
  const pipDist = new Map<string, number>();
  for (const c of tvaClients.values()) {
    const k = `${c.pipeline_statut ?? "null"}`;
    pipDist.set(k, (pipDist.get(k) ?? 0) + 1);
  }
  console.log(`\n=== Pipeline des ${tvaClients.size} clients TVA mensuelle ===`);
  for (const [k, n] of [...pipDist.entries()].sort()) console.log(`  ${k.padEnd(28)} ${n}`);

  // 4) Obligations TERMINE/NA existantes en DB pour TVA_MENSUELLE par année
  const obls = await fetchAll<any>(
    "obligations",
    "type, annee, statut_logique, periode",
    (q) => q.eq("type", "TVA_MENSUELLE")
  );
  const oblByYearStatut = new Map<string, number>();
  for (const o of obls) {
    const k = `${o.annee} | ${o.statut_logique}`;
    oblByYearStatut.set(k, (oblByYearStatut.get(k) ?? 0) + 1);
  }
  console.log(`\n=== Obligations TVA_MENSUELLE en DB : ${obls.length} ===`);
  for (const [k, n] of [...oblByYearStatut.entries()].sort()) console.log(`  ${k.padEnd(28)} ${n}`);

  // 5) Estimation "en retard" : cellules TVA attendues années <= 2025
  //    (échéance déjà passée) SANS obligation TERMINE/NA en DB.
  const doneKeys = new Set<string>();
  for (const o of obls) {
    if (o.statut_logique === "TERMINE" || o.statut_logique === "NON_APPLICABLE") {
      doneKeys.add(`${o.periode}`); // approximation (periode globale)
    }
  }
  console.log(`\n=== Hypothèse "en retard" ===`);
  console.log(`  Subs TVA d'années passées (<=2025) : ${tva.filter((s) => s.annee <= 2025).length}`);
  console.log(`  → chacune = 12 mois d'échéances déjà passées si non Terminé`);

  // 6) Clients internes / perdus dans le lot
  const internes = [...tvaClients.values()].filter(
    (c) => /interne|perdu|resili|résili/i.test(`${c.origine} ${c.pipeline_statut}`)
  );
  console.log(`\n=== Clients TVA potentiellement non-facturables (interne/perdu/résilié) ===`);
  for (const c of internes) console.log(`  ${c.denomination} | pipeline=${c.pipeline_statut} | origine=${c.origine}`);
  if (internes.length === 0) console.log("  (aucun)");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
