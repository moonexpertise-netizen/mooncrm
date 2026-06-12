/**
 * GET /api/chat/suggestions - Retourne 4 suggestions de commandes vocales
 * basees sur les vraies echeances a traiter ce mois. Affichees en boutons
 * d'amorce dans la bulle chat Jarvis.
 *
 * Exemple de retour :
 *   [
 *     { label: "TVA Adelex avril déclarée", command: "TVA Adelex Consulting avril déclarée" },
 *     { label: "AGO Borio Group déposée", command: "AGO Borio Group exercice 2025 déposée" },
 *     ...
 *   ]
 *
 * Strategie de selection :
 *   - Prend les obligations EN RETARD en priorite (les plus vieilles d'abord)
 *   - Complete avec les obligations a echeance ce mois si pas assez d'en-retard
 *   - Limite a 4 suggestions
 *   - Filtre les doublons par (client, type) pour ne pas saturer avec le meme client
 */

import { createClient } from "@/lib/supabase/server";
import { getEcheancesPourMois } from "@/lib/echeances-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const TYPE_LABEL: Record<string, string> = {
  TVA_MENSUELLE: "TVA",
  TVA_TRIMESTRIELLE: "TVA",
  TVA_ANNUELLE_CA12: "TVA CA12",
  IS_ACOMPTE: "Acompte IS",
  IS_SOLDE: "IS",
  CVAE: "CVAE",
  CVAE_ACOMPTE: "Acompte CVAE",
  TVS: "TVS",
  DAS2: "DAS2",
  COMPTA: "Compta",
  LIASSE_PLAQUETTE: "Bilan",
  AGO_DEPOT: "AGO",
  OSS: "OSS",
  DECL_2561: "IFU",
  DECL_2777: "Flat-tax 2777",
};

/** Verbe d'action court qui correspond a un libelle TERMINE typique pour le type. */
const TYPE_VERBE: Record<string, string> = {
  TVA_MENSUELLE: "déclarée",
  TVA_TRIMESTRIELLE: "déclarée",
  TVA_ANNUELLE_CA12: "déclarée",
  IS_ACOMPTE: "réglé",
  IS_SOLDE: "déclaré",
  CVAE: "déclarée",
  CVAE_ACOMPTE: "réglé",
  TVS: "déclarée",
  DAS2: "déclarée",
  COMPTA: "terminée",
  LIASSE_PLAQUETTE: "déposée",
  AGO_DEPOT: "déposée",
  OSS: "déclarée",
  DECL_2561: "déposée",
  DECL_2777: "déposée",
};

function formatPeriode(type: string, periode: string): string {
  // "2026-05" -> "mai"
  const m1 = periode.match(/^(\d{4})-(\d{2})$/);
  if (m1) return MOIS_FR[parseInt(m1[2], 10) - 1];
  // "T1-2026" -> "T1"
  const m2 = periode.match(/^T(\d)-(\d{4})$/);
  if (m2) return `T${m2[1]}`;
  // "A-06-2026" -> "acpt juin"
  const m3 = periode.match(/^A-(\d{2})-(\d{4})$/);
  if (m3) return `acompte ${MOIS_FR[parseInt(m3[1], 10) - 1]}`;
  // "S-2026" -> "solde"
  if (periode.startsWith("S-")) return "solde";
  // "2026" -> "exercice 2026"
  if (/^\d{4}$/.test(periode)) return `exercice ${periode}`;
  return periode;
}

export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return Response.json({ error: "Non authentifie" }, { status: 401 });
  }

  // Recupere le mois courant + le mois precedent pour avoir un pool decent
  const now = new Date();
  const result = await getEcheancesPourMois(now.getUTCMonth() + 1, now.getUTCFullYear());

  // Priorite : en retard d'abord (tries par date asc = les plus vieux),
  // puis a traiter ce mois. Dedup par (client, type) pour eviter de
  // suggerer 3 fois TVA pour le meme dossier.
  const seen = new Set<string>();
  type Sug = { label: string; command: string };
  const sugs: Sug[] = [];

  function tryAdd(it: {
    clientName: string;
    type: string;
    periode: string;
  }) {
    const dedupKey = `${it.clientName}|${it.type}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    const typeShort = TYPE_LABEL[it.type] ?? it.type.replace(/_/g, " ").toLowerCase();
    const verbe = TYPE_VERBE[it.type] ?? "terminée";
    const periodeLabel = formatPeriode(it.type, it.periode);
    // Nom client : 1er mot pour faire concis (ex. "Soulez Larivière" -> "Soulez")
    const firstWord = it.clientName.split(/\s+/)[0];
    const label = `${typeShort} ${firstWord} ${periodeLabel} ${verbe}`;
    // Commande envoyee : nom complet pour fuzzy match plus sur cote IA
    const command = `${typeShort} ${it.clientName} ${periodeLabel} ${verbe}`;
    sugs.push({ label, command });
  }

  for (const it of result.enRetard) {
    if (sugs.length >= 4) break;
    tryAdd(it);
  }
  for (const it of result.duMois) {
    if (sugs.length >= 4) break;
    tryAdd(it);
  }

  return Response.json({ suggestions: sugs });
}
