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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await sb
    .from("clients")
    .select("id, denomination, slug")
    .order("denomination")
    .limit(15);
  if (error) console.error(error);
  else for (const c of data) console.log(`  ${c.denomination.padEnd(40)} → ${c.slug}`);

  const { count } = await sb.from("clients").select("*", { count: "exact", head: true });
  console.log(`\nTotal : ${count} clients`);
}
main();
