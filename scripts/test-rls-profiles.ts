/**
 * Test : simule ce que fait le middleware en lisant profiles avec
 * un client anon authentifié (= comme la session utilisateur).
 * Si la RLS bloque, on saura.
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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // Test 1 : avec service role key (bypass RLS)
  console.log("=== Test 1 : service role (bypass RLS) ===");
  const sbService = createClient(url, serviceKey);
  const { data: p1, error: e1 } = await sbService
    .from("profiles")
    .select("id, email, approved, is_admin")
    .eq("email", "benjamin.perez@moonexpertise.fr")
    .maybeSingle();
  console.log("  data:", p1);
  console.log("  error:", e1?.message);

  // Test 2 : avec anon key (RLS active, mais pas de session → auth.uid() = null)
  console.log("\n=== Test 2 : anon (RLS active, auth.uid() = null) ===");
  const sbAnon = createClient(url, anonKey);
  const { data: p2, error: e2 } = await sbAnon
    .from("profiles")
    .select("id, email, approved, is_admin")
    .eq("email", "benjamin.perez@moonexpertise.fr")
    .maybeSingle();
  console.log("  data:", p2);
  console.log("  error:", e2?.message);

  // Test 3 : RLS policies définies sur profiles
  console.log("\n=== Test 3 : RLS policies sur profiles ===");
  const { data: policies, error: e3 } = await sbService.rpc("pg_policies_for", {
    tbl: "profiles",
  });
  if (e3?.message?.includes("does not exist")) {
    // Fallback : query directe sur pg_policies
    const { data: policies2 } = await sbService
      .from("pg_policies")
      .select("*")
      .eq("tablename", "profiles");
    console.log("  policies via pg_policies:", policies2);
  } else {
    console.log("  policies:", policies);
  }
}

main();
