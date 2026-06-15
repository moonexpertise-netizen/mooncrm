import { PageHeader } from "@/app/_components/page-header";
import { createClient } from "@/lib/supabase/server";
import {
  getEcheancesPourMois,
  moisLabelCapitalized,
  type EcheanceItem,
} from "@/lib/echeances-engine";
import { countCommentsByObligation } from "./comments-actions";
import EcheancesList from "./echeances-list";

export const dynamic = "force-dynamic";

/** Option de picker pour un type d'obligation (libelle + couleur + statut_logique).
 *  color est le keyword DB (amber / red / blue / emerald / violet / zinc) ou
 *  null ; le client le resout en classe Tailwind via statutColorClass(). */
export type EcheanceStatusOption = {
  libelle: string;
  color: string | null;
  statut_logique: "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";
};

/**
 * Page principale Echeances.
 *
 * Sequence de pilotage : un mois selectionne (via querystring ?month=YYYY-MM).
 * Deux listes :
 *   1. "A traiter ce mois" = echeances dont la dueDate tombe entre le 1er et
 *      le dernier jour du mois.
 *   2. "En retard" = echeances passees (dueDate < 1er du mois) non terminees.
 *
 * Source = engine `lib/echeances-engine.ts` qui combine subscriptions actives
 * (cellules attendues par les trackers) et obligations DB (statut reel).
 *
 * On precharge en parallele les status_options pour TOUS les types
 * d'obligations presents dans les resultats : chaque ligne peut ouvrir un
 * picker de statut (cf. EcheanceRow) qui appelle setEcheanceStatus.
 */
export default async function EcheancesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const { month, year } = parseMonthParam(sp.month);

  const result = await getEcheancesPourMois(month, year);

  // Types distincts presents dans les items -> on ne tire que ces lignes
  // de status_options (et pas toute la table). Vide si rien a afficher.
  const types = new Set<string>();
  for (const it of result.duMois) types.add(it.type);
  for (const it of result.enRetard) types.add(it.type);

  // Counts de commentaires pour les obligations DEJA en DB (les virtuelles
  // n'ont pas encore d'id donc pas de commentaires possibles). On les
  // affiche en pastille a cote du picker statut.
  const obligationIds: string[] = [];
  for (const it of result.duMois) if (it.obligationId) obligationIds.push(it.obligationId);
  for (const it of result.enRetard) if (it.obligationId) obligationIds.push(it.obligationId);

  const sb = await createClient();
  const [{ data: optsRaw }, commentCounts, { data: { user } }] = await Promise.all([
    types.size
      ? sb
          .from("status_options")
          .select("type_code, libelle, color, statut_logique, ordre")
          .eq("scope", "obligation")
          .eq("actif", true)
          .in("type_code", [...types])
          .order("ordre")
      : Promise.resolve({ data: null }),
    countCommentsByObligation(obligationIds),
    sb.auth.getUser(),
  ]);
  const currentUserEmail = user?.email ?? null;

  const statusOptionsByType: Record<string, EcheanceStatusOption[]> = {};
  for (const o of optsRaw ?? []) {
    const t = o.type_code as string;
    if (!statusOptionsByType[t]) statusOptionsByType[t] = [];
    statusOptionsByType[t].push({
      libelle: o.libelle as string,
      // color est un keyword (ex. "amber") cote DB ; il est resolu en
      // classe Tailwind cote client via statutColorClass(...).
      color: (o.color as string | null) ?? null,
      statut_logique: o.statut_logique as EcheanceStatusOption["statut_logique"],
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Échéances"
        description={`${moisLabelCapitalized(month, year)}, ${result.duMois.length} à traiter, ${result.enRetard.length} en retard`}
      />
      <EcheancesList
        month={month}
        year={year}
        duMois={result.duMois.map(serializeItem)}
        enRetard={result.enRetard.map(serializeItem)}
        statusOptionsByType={statusOptionsByType}
        commentCounts={commentCounts}
        currentUserEmail={currentUserEmail}
      />
    </div>
  );
}

// ============================================================================
//  Parsing du parametre ?month=YYYY-MM
// ============================================================================

function parseMonthParam(raw?: string): { month: number; year: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map((v) => parseInt(v, 10));
    if (m >= 1 && m <= 12 && y >= 2020 && y <= 2099) {
      return { month: m, year: y };
    }
  }
  // Defaut : mois courant
  const now = new Date();
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
}

// ============================================================================
//  Serialization : Date -> string pour passer cote client
// ============================================================================
//
// Les Server Components renvoient des objets serialisables vers les Client
// Components. Une instance Date est OK mais on prefere envoyer une string
// ISO pour fmtDateFr et formatage cote client sans surprise.

export type SerializedEcheanceItem = Omit<EcheanceItem, "dueDate"> & {
  dueDateIso: string;
};

function serializeItem(it: EcheanceItem): SerializedEcheanceItem {
  // Strip la propriete Date `dueDate` et la remplace par une string ISO
  const { dueDate, ...rest } = it;
  return { ...rest, dueDateIso: dueDate.toISOString().substring(0, 10) };
}
