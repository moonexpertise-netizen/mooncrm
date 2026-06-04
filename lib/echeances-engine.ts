/**
 * Engine de calcul des echeances obligations.
 *
 * Une seule source de verite pour la page /obligations (echeances) : etant
 * donne un mois calendaire, retourne :
 *   1. duMois : les echeances qui tombent ce mois-ci
 *   2. enRetard : les echeances passees non terminees (pour pilotage)
 *
 * Source des donnees :
 *   - Subscriptions actives = "cellules attendues" de la grille du tracker
 *   - Obligations en DB = statut reel (si saisi)
 *   - Si pas d'obligation DB pour une cellule attendue : placeholder = A_FAIRE
 *
 * Le calcul d'echeance par type est centralise dans lib/echeances.ts.
 * Les periodes attendues par type viennent du tracker (app/obligations/trackers.ts).
 */

import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { computeEcheance } from "@/lib/echeances";
import {
  TRACKERS,
  slugForType,
  type Tracker,
} from "@/app/obligations/trackers";

// ============================================================================
//  Types publics
// ============================================================================

export type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export type EcheanceItem = {
  /** ID de l'obligation DB. null = placeholder (cellule attendue sans ligne DB). */
  obligationId: string | null;
  /** UUID client */
  clientId: string;
  clientSlug: string;
  clientName: string;
  clientSiren: string | null;
  /** Type d'obligation (TVA_MENSUELLE, AGO_DEPOT, etc.) */
  type: string;
  /** Slug du tracker dont la cellule fait partie. */
  trackerSlug: string;
  /** Titre lisible du tracker (ex. "TVA mensuelle (CA3M)"). */
  trackerTitle: string;
  /** Periode brute (ex. "2026-05", "A-06-2026", "2025"). */
  periode: string;
  /** Label lisible de la periode (ex. "mai 2026", "Acpt juin 2026"). */
  periodeLabel: string;
  /** Annee fiscale de l'obligation (= champ DB `annee`). */
  annee: number;
  /** Date d'echeance calculee (UTC). */
  dueDate: Date;
  /** Statut logique. null = pas d'obligation en DB (placeholder A_FAIRE par defaut). */
  statut: StatutLogique | null;
  /** Libelle precis du statut DB (ex. "EDI - Termine"). null si placeholder. */
  statutDetail: string | null;
  /** Difference en jours vs today (negatif = en retard). */
  daysOffset: number;
  /** Cloture du client (pour debug / traçabilite). */
  clotureLabel: string | null;
};

export type EcheancesPourMois = {
  /** Mois cible (1-12). */
  month: number;
  /** Annee cible (4 chiffres). */
  year: number;
  /** Echeances tombant entre le 1er et le dernier jour du mois. Triees par date asc. */
  duMois: EcheanceItem[];
  /** Echeances passees (dueDate < 1er du mois) non terminees. Triees par date asc. */
  enRetard: EcheanceItem[];
};

// ============================================================================
//  Helpers de date (UTC partout, comme lib/echeances.ts)
// ============================================================================

function firstOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function lastOfMonthUtc(year: number, month: number): Date {
  // Date.UTC(year, month, 0) = dernier jour du mois `month` (1-based)
  return new Date(Date.UTC(year, month, 0));
}

function isoDay(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const MOIS_LABEL = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
];

/** Formatte une periode brute en label lisible. */
function formatPeriodeLabel(type: string, periode: string): string {
  // TVA mensuelle / TVS / DES / OSS / Pilotage : "YYYY-MM" -> "mai 2026"
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    return `${MOIS_LABEL[mo - 1]} ${y}`;
  }
  // Trimestre : "T1-YYYY" -> "T1 2026"
  const t = periode.match(/^T(\d)-(\d{4})$/);
  if (t) return `T${t[1]} ${t[2]}`;
  // Acompte IS / CVAE / CA12 : "A-MM-YYYY" -> "Acpt mai 2026"
  const a = periode.match(/^A-(\d{2})-(\d{4})$/);
  if (a) {
    const mo = parseInt(a[1], 10);
    return `Acpt ${MOIS_LABEL[mo - 1]} ${a[2]}`;
  }
  // Solde CA12 : "S-YYYY"
  const s = periode.match(/^S-(\d{4})$/);
  if (s) return `Solde ${s[1]}`;
  // Annuel : "YYYY" -> "Exercice 2025"
  const y = periode.match(/^(\d{4})$/);
  if (y) return `Exercice ${y[1]}`;
  return periode;
}

// ============================================================================
//  Types internes
// ============================================================================

type SubRow = {
  client_id: string;
  type: string;
  annee: number;
  clients: {
    id: string;
    slug: string;
    denomination: string;
    siren: string | null;
    pipeline_statut: string | null;
    origine: string | null;
    jour_cloture: number | null;
    mois_cloture: number | null;
  };
};

type OblRow = {
  id: string;
  client_id: string;
  type: string;
  periode: string;
  annee: number;
  statut_logique: StatutLogique;
  statut_detail: string | null;
};

// ============================================================================
//  API principale
// ============================================================================

/**
 * Charge les echeances obligations pour le mois donne.
 *
 * @param month 1-12
 * @param year  4 chiffres
 */
export async function getEcheancesPourMois(
  month: number,
  year: number,
): Promise<EcheancesPourMois> {
  const sb = await createClient();

  // Bornes du mois cible
  const monthStart = firstOfMonthUtc(year, month);
  const monthEnd = lastOfMonthUtc(year, month);
  const today = todayUtc();
  const monthStartIso = isoDay(monthStart);
  const monthEndIso = isoDay(monthEnd);
  const todayIso = isoDay(today);

  // Fenetre d'annees a charger : on prend [year-2, year+1] pour capturer :
  //   - les obligations annuelles N-1 (cloture decembre N-1, echeance en N)
  //   - les obligations annuelles N-2 si decalees (cloture 30/06/N-1)
  //   - les obligations N+1 si on regarde un mois futur
  const anneeMin = year - 2;
  const anneeMax = year + 1;

  // 1) Subscriptions actives = cellules attendues
  // 2) Obligations en DB = statuts reels
  const [{ data: subs }, { data: obls }] = await Promise.all([
    sb
      .from("obligation_subscriptions")
      .select(
        "client_id, type, annee, clients!inner(id, slug, denomination, siren, pipeline_statut, origine, jour_cloture, mois_cloture)",
      )
      .gte("annee", anneeMin)
      .lte("annee", anneeMax)
      .eq("actif", true),
    sb
      .from("obligations")
      .select("id, client_id, type, periode, annee, statut_logique, statut_detail")
      .gte("annee", anneeMin)
      .lte("annee", anneeMax),
  ]);

  // Index des obligations DB par (client_id|type|annee|periode) -> ligne
  const oblByKey = new Map<string, OblRow>();
  for (const o of (obls ?? []) as OblRow[]) {
    oblByKey.set(`${o.client_id}|${o.type}|${o.annee}|${o.periode}`, o);
  }

  // On itere sur les subscriptions. Pour chaque (sub, periode attendue par
  // le tracker), on calcule l'echeance et on classe.
  const duMois: EcheanceItem[] = [];
  const enRetard: EcheanceItem[] = [];
  const seen = new Set<string>();

  // Index slug tracker -> Tracker pour acces rapide
  const trackerByType = new Map<string, Tracker>();
  for (const t of TRACKERS) {
    for (const ty of t.types) trackerByType.set(ty, t);
  }

  for (const s of (subs ?? []) as unknown as SubRow[]) {
    if (!isClientBillable(s.clients)) continue;

    const tracker = trackerByType.get(s.type);
    if (!tracker) continue;

    const cloture =
      s.clients.jour_cloture && s.clients.mois_cloture
        ? { jour: s.clients.jour_cloture, mois: s.clients.mois_cloture }
        : { jour: 31, mois: 12 };

    // Periodes attendues du tracker pour l'annee de la sub. On filtre par type
    // (tracker peut avoir plusieurs types) et on saute les colonnes
    // "facturation" qui ne sont qu'un rendu, pas une cellule distincte cote DB.
    const cols = tracker
      .cols(s.annee)
      .filter((c) => c.type === s.type && c.kind !== "facturation");

    for (const col of cols) {
      const cellKey = `${s.client_id}|${s.type}|${s.annee}|${col.periode}`;
      if (seen.has(cellKey)) continue;
      seen.add(cellKey);

      const ech = computeEcheance(s.type, col.periode, s.annee, cloture);
      if (!ech) continue;
      const dueIso = isoDay(ech.dueDate);

      // Statut DB : si existe, sinon placeholder (= A_FAIRE par defaut)
      const obl = oblByKey.get(cellKey);
      const statut: StatutLogique | null = obl ? obl.statut_logique : null;
      const isDone =
        statut === "TERMINE" || statut === "NON_APPLICABLE";

      const item: EcheanceItem = {
        obligationId: obl?.id ?? null,
        clientId: s.clients.id,
        clientSlug: s.clients.slug,
        clientName: s.clients.denomination,
        clientSiren: s.clients.siren,
        type: s.type,
        trackerSlug: tracker.slug,
        trackerTitle: tracker.title,
        periode: col.periode,
        periodeLabel: formatPeriodeLabel(s.type, col.periode),
        annee: s.annee,
        dueDate: ech.dueDate,
        statut,
        statutDetail: obl?.statut_detail ?? null,
        daysOffset: Math.round(
          (ech.dueDate.getTime() - today.getTime()) / (24 * 3600 * 1000),
        ),
        clotureLabel: s.clients.jour_cloture && s.clients.mois_cloture
          ? `${String(s.clients.jour_cloture).padStart(2, "0")}/${String(s.clients.mois_cloture).padStart(2, "0")}`
          : null,
      };

      // Classement
      if (dueIso >= monthStartIso && dueIso <= monthEndIso) {
        // L'echeance tombe dans le mois cible
        duMois.push(item);
      } else if (dueIso < monthStartIso && !isDone && dueIso < todayIso) {
        // Echeance passee non terminee et anterieure au mois cible
        enRetard.push(item);
      }
    }
  }

  // Tri par date d'echeance asc, puis client
  const cmp = (a: EcheanceItem, b: EcheanceItem) => {
    const da = a.dueDate.getTime();
    const db = b.dueDate.getTime();
    if (da !== db) return da - db;
    return a.clientName.localeCompare(b.clientName, "fr");
  };
  duMois.sort(cmp);
  enRetard.sort(cmp);

  return { month, year, duMois, enRetard };
}

// ============================================================================
//  Helpers expose pour l'UI (label de mois courant)
// ============================================================================

export function moisLabel(month: number, year: number): string {
  return `${MOIS_LABEL[month - 1]} ${year}`;
}

export function moisLabelCapitalized(month: number, year: number): string {
  const s = moisLabel(month, year);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
