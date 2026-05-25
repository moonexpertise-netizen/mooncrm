/**
 * Script de debug : interroge la DB pour comprendre l'état des profiles +
 * auth.users côté Supabase. Utilise la service role key (bypass RLS).
 * Usage : npx tsx scripts/debug-profiles.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Parse .env.local sans dépendance dotenv (KEY=VALUE par ligne, # commentaires).
const envFile = readFileSync(".env.local", "utf8");
const env: Record<string, string> = {};
for (const line of envFile.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env vars NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== auth.users ===");
  const { data: users, error: e1 } = await supabase.auth.admin.listUsers();
  if (e1) {
    console.error("Error listing users:", e1);
  } else {
    for (const u of users.users) {
      console.log(
        `  id=${u.id} email=${u.email} created=${u.created_at} confirmed=${u.email_confirmed_at ? "yes" : "no"}`
      );
    }
  }

  console.log("\n=== public.profiles ===");
  const { data: profiles, error: e2 } = await supabase
    .from("profiles")
    .select("*");
  if (e2) {
    console.error("Error listing profiles:", e2);
  } else {
    for (const p of profiles ?? []) {
      console.log(
        `  id=${p.id} email=${p.email} approved=${p.approved} is_admin=${p.is_admin} approved_at=${p.approved_at}`
      );
    }
  }
}

main();
