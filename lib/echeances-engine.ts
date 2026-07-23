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
import { isCoveredByDebut } from "@/lib/obligations-engine";
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
    debut_obligations: string | null;
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

  // Borne BASSE de la section "en retard" : on ne remonte pas les retards
  // au-dela du 1er janvier de l'annee affichee.
  //
  // POURQUOI : les souscriptions importees de Notion couvrent des exercices
  // passes (2023, 2024, 2025). Les obligations correspondantes ont ete
  // reellement deposees a l'epoque, mais jamais cochees "Termine" dans le
  // CRM (qui n'existait pas). Sans borne, "en retard" affiche des centaines
  // de cellules fantomes (ex. TVA mensuelle de fevrier 2025 a 476j de
  // retard, y compris pour des dossiers internes) -> bruit ininterpretable.
  //
  // Le tracker de chaque obligation, lui, continue d'afficher TOUT l'
  // historique : on ne perd aucune donnee, on nettoie juste la todo-list
  // de pilotage mensuel.
  //
  // Pour changer la regle : repartir totalement a neuf = `today` ; fenetre
  // glissante de N mois = recalculer une date a N mois en arriere.
  const retardDepuisIso = isoDay(firstOfMonthUtc(year, 1));

  // Fenetre d'annees a charger : on prend [year-2, year+1] pour capturer :
  //   - les obligations annuelles N-1 (cloture decembre N-1, echeance en N)
  //   - les obligations annuelles N-2 si decalees (cloture 30/06/N-1)
  //   - les obligations N+1 si on regarde un mois futur
  const anneeMin = year - 2;
  const anneeMax = year + 1;

  // 1) Subscriptions actives = cellules attendues
  // 2) Obligations en DB = statuts reels
  //
  // Pagination explicite : Supabase / PostgREST tronque silencieusement les
  // SELECT a 1000 lignes par defaut (max-rows). Meme `.limit(50000)` ne suffit
  // pas si le serveur enforce une borne stricte. On itere par chunks de 1000
  // jusqu'a avoir tout. Avec ~80 clients x ~12 TVA x plusieurs annees on a
  // facilement plusieurs milliers d'obligations en DB.
  //
  // Quand des obligations sont tronquees, le matching oblByKey echoue ->
  // l'engine tombe sur le placeholder et affiche "A faire" pour des cellules
  // pourtant Terminees dans le tracker. C'est exactement le bug visible sur
  // Borio TVA janvier 2025.
  async function fetchAllSubs(): Promise<SubRow[]> {
    const PAGE = 1000;
    const out: SubRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await sb
        .from("obligation_subscriptions")
        .select(
          "client_id, type, annee, clients!inner(id, slug, denomination, siren, pipeline_statut, origine, jour_cloture, mois_cloture, debut_obligations)",
        )
        .gte("annee", anneeMin)
        .lte("annee", anneeMax)
        .eq("actif", true)
        // Tri STABLE obligatoire : sans ORDER BY, Postgres ne garantit pas
        // l'ordre entre les pages .range() -> des lignes sont sautees ou
        // dupliquees d'une page a l'autre (et le resultat change a chaque
        // requete). C'est la cause des fausses echeances qui "disparaissent
        // au refresh". Cf. bug rapporte 06/2026.
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as SubRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }
  async function fetchAllObligations(): Promise<OblRow[]> {
    const PAGE = 1000;
    const out: OblRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await sb
        .from("obligations")
        .select("id, client_id, type, periode, annee, statut_logique, statut_detail")
        .gte("annee", anneeMin)
        .lte("annee", anneeMax)
        // Tri STABLE obligatoire pour une pagination .range() fiable (sinon des
        // obligations TERMINE manquent et ressortent en "A faire"). Cf. ci-dessus.
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as OblRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }
  const [subs, obls] = await Promise.all([fetchAllSubs(), fetchAllObligations()]);

  // Index des obligations DB par (client_id|type|periode).
  //
  // On exclut volontairement `annee` de la cle de matching : en pratique
  // une obligation TVA mensuelle "2025-01" peut avoir annee=2025 en DB
  // alors qu'une autre cellule attendue d'une sub annee=2025 referencerait
  // theoriquement la meme periode mais avec une annee fiscale differente
  // (ex. import legacy avec annee=2024). Sans cette tolerance, les
  // obligations TERMINE deviennent invisibles -> tout ressort en placeholder
  // "A faire" alors que la cellule est saisie en DB.
  //
  // En cas de doublon en DB pour la meme cle (rare mais arrive avec des
  // imports), on garde celle dont le statut est le plus avance :
  //   TERMINE > NON_APPLICABLE > EN_COURS > A_FAIRE
  // Comme ca une cellule cochee "Termine" ne risque pas d'etre ecrasee
  // par un doublon en A_FAIRE.
  const STATUT_RANK: Record<StatutLogique, number> = {
    TERMINE: 4,
    NON_APPLICABLE: 3,
    EN_COURS: 2,
    A_FAIRE: 1,
  };
  const oblByKey = new Map<string, OblRow>();
  for (const o of obls) {
    const key = `${o.client_id}|${o.type}|${o.periode}`;
    const existing = oblByKey.get(key);
    if (!existing) {
      oblByKey.set(key, o);
    } else if ((STATUT_RANK[o.statut_logique] ?? 0) > (STATUT_RANK[existing.statut_logique] ?? 0)) {
      oblByKey.set(key, o);
    }
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

  // Types exclus de la page /obligations (echeances mensuelles).
  // Le tracker dedie reste accessible, mais ces obligations ne polluent
  // pas la todo-list de pilotage du mois.
  //  - DES : volume trop important + traite en routine, non strategique
  //    pour le pilotage cabinet (ajoute par Benjamin, juin 2026).
  const EXCLUDED_FROM_ECHEANCES = new Set<string>(["DES"]);

  for (const s of subs) {
    if (!isClientBillable(s.clients)) continue;
    if (EXCLUDED_FROM_ECHEANCES.has(s.type)) continue;

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
      // Cle de deduplication des cellules vues (inclut annee = annee fiscale
      // de la sub, pour ne pas confondre 2 cellules de meme periode mais
      // d'exercices differents, ex. AGO 2024 et AGO 2025).
      const seenKey = `${s.client_id}|${s.type}|${s.annee}|${col.periode}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);

      const ech = computeEcheance(s.type, col.periode, s.annee, cloture);
      if (!ech) continue;
      const dueIso = isoDay(ech.dueDate);

      // Lookup obligation DB : cle SANS annee (cf. commentaire ci-dessus).
      const oblKey = `${s.client_id}|${s.type}|${col.periode}`;
      const obl = oblByKey.get(oblKey);

      // Prise en charge du cabinet : meme regle que le moteur de generation
      // des lignes `obligations` (isCoveredByDebut). Sans ca, un dossier
      // repris en cours d'annee (ou une societe en cours de creation) fait
      // remonter des echeances FANTOMES "en retard" pour les mois anterieurs,
      // alors que le tracker affiche un "-" non cliquable pour ces cellules.
      // On ne masque que les cellules VIRTUELLES : si une obligation existe
      // deja en DB, elle reste visible (saisie manuelle, import, exception).
      if (!obl && !isCoveredByDebut(col.periode, dueIso, s.clients.debut_obligations)) {
        continue;
      }
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

      // Classement (on exclut systematiquement les Termine/NA : si c'est
      // fait, ca n'a plus rien a faire dans une liste "a traiter").
      if (isDone) continue;
      if (dueIso >= monthStartIso && dueIso <= monthEndIso) {
        // L'echeance tombe dans le mois cible
        duMois.push(item);
      } else if (
        dueIso < monthStartIso &&
        dueIso < todayIso &&
        dueIso >= retardDepuisIso
      ) {
        // Echeance passee non terminee, anterieure au mois cible, ET dans la
        // fenetre de retards retenue (>= 1er janvier de l'annee affichee).
        // Cf. commentaire sur retardDepuisIso : exclut le backlog importe.
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
