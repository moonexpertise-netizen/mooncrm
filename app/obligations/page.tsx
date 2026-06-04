import { PageHeader } from "@/app/_components/page-header";
import {
  getEcheancesPourMois,
  moisLabelCapitalized,
  type EcheanceItem,
} from "@/lib/echeances-engine";
import EcheancesList from "./echeances-list";

export const dynamic = "force-dynamic";

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
 */
export default async function EcheancesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const { month, year } = parseMonthParam(sp.month);

  const result = await getEcheancesPourMois(month, year);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Échéances"
        description={`${moisLabelCapitalized(month, year)} · ${result.duMois.length} à traiter · ${result.enRetard.length} en retard`}
      />
      <EcheancesList
        month={month}
        year={year}
        duMois={result.duMois.map(serializeItem)}
        enRetard={result.enRetard.map(serializeItem)}
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
