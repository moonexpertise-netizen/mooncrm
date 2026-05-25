/**
 * Script de test : interroge l'API INPI pour un SIREN donné et affiche
 * la date de clôture récupérée.
 *
 * Pré-requis : INPI_USERNAME et INPI_PASSWORD dans .env.local
 *
 * Usage :
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/test-inpi.ts 937837193
 */

import { getInpiCompany } from "../lib/inpi";

async function main() {
  const siren = process.argv[2];
  if (!siren) {
    console.error("Usage: test-inpi.ts <siren>");
    process.exit(2);
  }
  console.log(`→ Interrogation INPI pour SIREN ${siren}…`);
  const data = await getInpiCompany(siren);
  if (!data) {
    console.log("  → Entreprise non trouvée");
    return;
  }
  console.log("  Clôture :", data.cloture);
  if (data.cloture) {
    console.log(
      `  → ${String(data.cloture.jour).padStart(2, "0")}/${String(data.cloture.mois).padStart(2, "0")}`
    );
  } else {
    console.log("  → pas de date de clôture renvoyée");
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message ?? e);
  process.exit(1);
});
