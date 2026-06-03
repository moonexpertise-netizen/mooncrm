import Link from "next/link";
import { AlertTriangle, Clock, CalendarClock, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import { computeEcheance } from "@/lib/echeances";
import { isClientBillable } from "@/lib/billable";
import { TRACKERS, slugForType } from "../trackers";
import { cn, fmtDateFr } from "@/lib/utils";

export const dynamic = "force-dynamic";

type FilterKind = "overdue" | "7j" | "30j";

/**
 * Page dediee aux obligations a risque : liste plate triee par echeance,
 * avec filtre par type de risque (en retard / <=7j / <=30j).
 *
 * Liee depuis le widget "Production a risque" du dashboard principal.
 * Chaque ligne est cliquable pour aller a la fiche client.
 */
export default async function EcheancesRisquePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filterParam = sp.filter ?? "overdue";
  const filter: FilterKind = filterParam === "7j" ? "7j" : filterParam === "30j" ? "30j" : "overdue";

  const supabase = await createClient();

  const { data: obligations } = await supabase
    .from("obligations")
    .select(
      "id, type, periode, annee, statut_logique, client_id, obligation_subscriptions!inner(actif), clients!inner(id, slug, denomination, siren, pipeline_statut, origine, jour_cloture, mois_cloture)"
    )
    .gte("annee", new Date().getFullYear() - 1)
    .eq("obligation_subscriptions.actif", true);

  type Row = {
    id: string;
    type: string;
    periode: string;
    annee: number;
    statut_logique: string;
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDays = new Date(today);
  sevenDays.setDate(today.getDate() + 7);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(today.getDate() + 30);

  type Item = {
    obligationId: string;
    clientSlug: string;
    clientName: string;
    clientSiren: string | null;
    type: string;
    periode: string;
    statut: string;
    dueDate: Date;
    trackerSlug: string | null;
    daysOffset: number; // days vs today (negative = en retard)
  };

  const items: Item[] = [];

  for (const o of (obligations ?? []) as unknown as Row[]) {
    const c = o.clients;
    if (!isClientBillable(c)) continue;
    if (o.statut_logique === "TERMINE" || o.statut_logique === "NON_APPLICABLE") continue;

    const cloture = (c.jour_cloture && c.mois_cloture)
      ? { jour: c.jour_cloture, mois: c.mois_cloture }
      : { jour: 31, mois: 12 };
    const ech = computeEcheance(o.type, o.periode, o.annee, cloture);
    if (!ech) continue;

    const due = new Date(ech.dueDate);
    due.setHours(0, 0, 0, 0);

    let matches = false;
    if (filter === "overdue" && due < today) matches = true;
    else if (filter === "7j" && due >= today && due <= sevenDays) matches = true;
    else if (filter === "30j" && due >= today && due <= thirtyDays) matches = true;
    if (!matches) continue;

    const daysOffset = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    items.push({
      obligationId: o.id,
      clientSlug: c.slug,
      clientName: c.denomination,
      clientSiren: c.siren,
      type: o.type,
      periode: o.periode,
      statut: o.statut_logique,
      dueDate: due,
      trackerSlug: slugForType(o.type),
      daysOffset,
    });
  }

  // Tri : echeance la plus proche / la plus en retard d'abord
  items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const trackerLabelByType = (type: string): string => {
    const slug = slugForType(type);
    return TRACKERS.find((t) => t.slug === slug)?.title ?? type;
  };

  const titleByFilter: Record<FilterKind, string> = {
    overdue: "Échéances dépassées",
    "7j": "Échéance dans ≤ 7 jours",
    "30j": "Échéance dans ≤ 30 jours",
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={titleByFilter[filter]}
        description={`${items.length} obligation${items.length > 1 ? "s" : ""} non terminée${items.length > 1 ? "s" : ""}. Cliquer pour ouvrir le dossier.`}
        actions={
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour au tableau de bord
          </Link>
        }
      />

      {/* Chips de switch entre les 3 filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip kind="overdue" active={filter === "overdue"} icon={<AlertTriangle className="h-3.5 w-3.5" />} label="En retard" />
        <FilterChip kind="7j" active={filter === "7j"} icon={<Clock className="h-3.5 w-3.5" />} label="≤ 7 jours" />
        <FilterChip kind="30j" active={filter === "30j"} icon={<CalendarClock className="h-3.5 w-3.5" />} label="≤ 30 jours" />
      </div>

      {/* Liste plate */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          Rien à signaler ici, tout est sous contrôle.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Client
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Obligation
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Période
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Échéance
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {items.map((it) => {
                const dueIso = it.dueDate.toISOString().substring(0, 10);
                return (
                  <tr key={it.obligationId} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/clients/${it.clientSlug}`}
                        className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                      >
                        {it.clientName}
                      </Link>
                      {it.clientSiren && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                          {it.clientSiren}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {it.trackerSlug ? (
                        <Link
                          href={`/obligations/${it.trackerSlug}`}
                          className="text-zinc-700 dark:text-zinc-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                        >
                          {trackerLabelByType(it.type)}
                        </Link>
                      ) : (
                        <span className="text-zinc-700 dark:text-zinc-300">{trackerLabelByType(it.type)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {it.periode}
                    </td>
                    <td className="px-4 py-2.5">
                      <div
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums",
                          it.daysOffset < 0
                            ? "text-rose-600 dark:text-rose-400"
                            : it.daysOffset <= 7
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        <span>{fmtDateFr(dueIso)}</span>
                        <span className="text-[10px] opacity-70">
                          {it.daysOffset < 0
                            ? `(${Math.abs(it.daysOffset)}j en retard)`
                            : it.daysOffset === 0
                            ? "(aujourd'hui)"
                            : `(dans ${it.daysOffset}j)`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
                          it.statut === "A_FAIRE"
                            ? "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/40"
                            : "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/40"
                        )}
                      >
                        {it.statut === "A_FAIRE" ? "À faire" : "En cours"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  kind,
  active,
  icon,
  label,
}: {
  kind: FilterKind;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={`/obligations/echeances?filter=${kind}`}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
        active
          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
          : "bg-white dark:bg-white/[0.02] border-zinc-200 dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05]"
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
