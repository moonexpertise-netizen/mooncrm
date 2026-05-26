"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatutLogique =
  | "A_FAIRE"
  | "EN_COURS"
  | "TERMINE"
  | "NON_APPLICABLE";

export type MatriceRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  forme: string | null;
  origine: string | null;
  /** Statut par task_key dans l'ordre de TASK_ORDER. null = tâche non créée pour ce dossier. */
  tasks: Array<StatutLogique | null>;
  done: number;
  total: number;
};

// Libellés courts pour les en-têtes (colonnes étroites). On garde le mot-clé.
const TASK_SHORT_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally",
  acces_pennylane: "Pennylane",
  depot_kbis_banque: "KBIS banque",
  confrere: "Confrère",
  abo_moon: "Abo MOON",
  mandat_moon: "Mandat MOON",
  impot_gouv: "impôt.gouv",
  mandat_impots: "Mandat impôts",
  cfe_1447: "CFE 1447",
  ob_pennylane: "OB Pennylane",
  option_ir_is: "IR/IS",
  previ_tns: "Prévi TNS",
  affiliation_tns: "Affiliation TNS",
};

// Libellés longs pour les tooltips
const TASK_LONG_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally rempli",
  acces_pennylane: "Accès Pennylane créé",
  depot_kbis_banque: "Dépôt KBIS auprès de la banque",
  confrere: "Reprise confrère",
  abo_moon: "Abonnement MOON actif",
  mandat_moon: "Mandat de prélèvement MOON signé",
  impot_gouv: "Accès au compte impôt.gouv",
  mandat_impots: "Mandat des impôts signé et envoyé à la banque",
  cfe_1447: "751-SD ou 1447 CFE signé et déposé sur messagerie",
  ob_pennylane: "Onboarding Pennylane réalisé",
  option_ir_is: "Lettre d'option IR/IS",
  previ_tns: "Prévisionnel TNS réalisé",
  affiliation_tns: "Affiliation TNS réalisée",
};

type OrigineType = "creation" | "reprise" | "interne" | "soustraitance" | "autre";
const TYPE_LABEL: Record<OrigineType, string> = {
  creation: "Création",
  reprise: "Reprise",
  interne: "Interne",
  soustraitance: "Sous-traitance",
  autre: "Autre",
};
const TYPE_PILL: Record<OrigineType, string> = {
  creation: "bg-sky-50 text-sky-800 border-sky-300",
  reprise: "bg-violet-50 text-violet-800 border-violet-300",
  interne: "bg-amber-50 text-amber-800 border-amber-300",
  soustraitance: "bg-zinc-100 text-zinc-700 border-zinc-300",
  autre: "bg-zinc-50 text-zinc-500 border-zinc-200",
};
function origineToType(origine: string | null): OrigineType {
  if (!origine) return "autre";
  if (origine === "1 - Création") return "creation";
  if (origine === "2 - Reprise" || origine === "3 - Reprise sans EC") return "reprise";
  if (origine === "4 - Interne") return "interne";
  if (origine === "5 - Sous-traitance") return "soustraitance";
  return "autre";
}

type TypeFilter = "all" | OrigineType;

/**
 * Tableau matriciel de l'onboarding (lecture seule).
 *
 *  - Première colonne sticky : client + Type chip
 *  - 13 colonnes étroites : 1 par task_key dans l'ordre canonique
 *  - Dernière colonne : score done/total + barre mini
 *  - Cellule : pastille couleur selon statut
 *  - Filtre Type + recherche
 *
 * L'édition se fait sur la fiche client (clic sur la ligne navigue vers
 * /clients/[slug]/onboarding).
 */
export default function MatriceTable({
  rows,
  taskKeys,
}: {
  rows: MatriceRow[];
  taskKeys: string[];
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const annotated = useMemo(
    () => rows.map((r) => ({ ...r, type: origineToType(r.origine) })),
    [rows]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return annotated.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      return true;
    });
  }, [annotated, search, typeFilter]);

  // Tri stable : Type → progression croissante → nom
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const typeOrder: OrigineType[] = ["creation", "reprise", "interne", "soustraitance", "autre"];
    arr.sort((a, b) => {
      const ta = typeOrder.indexOf(a.type);
      const tb = typeOrder.indexOf(b.type);
      if (ta !== tb) return ta - tb;
      const pa = a.total > 0 ? a.done / a.total : -1;
      const pb = b.total > 0 ? b.done / b.total : -1;
      if (pa !== pb) return pa - pb;
      return a.denomination.localeCompare(b.denomination, "fr");
    });
    return arr;
  }, [filtered]);

  // Compteurs par type pour les pills (sur l'ensemble, pas filtré)
  const typeCounts = useMemo(() => {
    const c = { all: annotated.length, creation: 0, reprise: 0, interne: 0, soustraitance: 0, autre: 0 };
    for (const r of annotated) c[r.type]++;
    return c;
  }, [annotated]);

  // Stats par colonne (taux de complétion d'une tâche sur tous les dossiers filtrés)
  const colStats = useMemo(() => {
    return taskKeys.map((_, i) => {
      let done = 0;
      let total = 0;
      for (const r of sorted) {
        const s = r.tasks[i];
        if (s === null) continue;
        total++;
        if (s === "TERMINE" || s === "NON_APPLICABLE") done++;
      }
      return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
  }, [sorted, taskKeys]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filtrer par nom ou SIREN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <span className="text-[11px] text-zinc-500">Type :</span>
        <FilterChip label="Tous" value="all" current={typeFilter} count={typeCounts.all} onClick={() => setTypeFilter("all")} />
        <FilterChip label="Création" value="creation" current={typeFilter} count={typeCounts.creation} type="creation" onClick={() => setTypeFilter("creation")} />
        <FilterChip label="Reprise" value="reprise" current={typeFilter} count={typeCounts.reprise} type="reprise" onClick={() => setTypeFilter("reprise")} />
        <FilterChip label="Interne" value="interne" current={typeFilter} count={typeCounts.interne} type="interne" onClick={() => setTypeFilter("interne")} />
        <FilterChip label="Sous-traitance" value="soustraitance" current={typeFilter} count={typeCounts.soustraitance} type="soustraitance" onClick={() => setTypeFilter("soustraitance")} />
        <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">
          {sorted.length} dossier{sorted.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap px-1">
        <LegendItem statut="TERMINE" label="Terminé" />
        <LegendItem statut="EN_COURS" label="En cours" />
        <LegendItem statut="A_FAIRE" label="À faire" />
        <LegendItem statut="NON_APPLICABLE" label="N/A" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded border border-dashed border-zinc-300" />
          Tâche non créée
        </span>
      </div>

      {/* Tableau */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun dossier ne correspond aux filtres.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              {/* Numéro de colonne */}
              <tr className="bg-zinc-50">
                <th
                  className="sticky left-0 z-20 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-700 border-b border-r border-zinc-200"
                  style={{ minWidth: 240 }}
                >
                  Dossier
                </th>
                {taskKeys.map((k, i) => (
                  <th
                    key={k}
                    className="px-1 py-2 text-center text-[10px] font-medium text-zinc-600 border-b border-zinc-200 align-bottom"
                    title={TASK_LONG_LABEL[k] ?? k}
                    style={{ minWidth: 50 }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-zinc-400 tabular-nums">{i + 1}</span>
                      <span className="leading-tight text-[10px] text-zinc-700">
                        {TASK_SHORT_LABEL[k] ?? k}
                      </span>
                    </div>
                  </th>
                ))}
                <th
                  className="px-2 py-2 text-center text-xs font-medium text-zinc-700 border-b border-l border-zinc-200"
                  style={{ minWidth: 110 }}
                >
                  Progression
                </th>
              </tr>
              {/* Stats par colonne */}
              <tr className="bg-zinc-50/50">
                <th
                  className="sticky left-0 z-20 bg-zinc-50/50 px-3 py-1 text-left text-[10px] font-medium text-zinc-400 border-b border-r border-zinc-200"
                >
                  % terminé / colonne
                </th>
                {colStats.map((s, i) => (
                  <th
                    key={i}
                    className="px-1 py-1 text-center text-[10px] tabular-nums font-medium border-b border-zinc-200"
                  >
                    <span
                      className={cn(
                        s.total === 0
                          ? "text-zinc-300"
                          : s.pct >= 100
                          ? "text-emerald-600"
                          : s.pct >= 50
                          ? "text-amber-600"
                          : "text-rose-600"
                      )}
                    >
                      {s.total > 0 ? `${s.pct}%` : "—"}
                    </span>
                  </th>
                ))}
                <th className="border-b border-l border-zinc-200" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr
                  key={r.id}
                  className={cn(
                    "group/row transition-colors",
                    idx % 2 === 0 ? "bg-white" : "bg-zinc-50/30",
                    "hover:bg-amber-50/40"
                  )}
                >
                  {/* Sticky : client */}
                  <td
                    className="sticky left-0 z-10 bg-inherit px-3 py-2 border-b border-r border-zinc-100"
                  >
                    <Link
                      href={`/clients/${r.slug}/onboarding`}
                      className="block group-hover/row:underline"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-zinc-900 truncate">
                          {r.denomination}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
                            TYPE_PILL[r.type]
                          )}
                        >
                          {TYPE_LABEL[r.type]}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                        {r.siren && <span className="tabular-nums">{r.siren}</span>}
                        {r.forme && <span>· {r.forme}</span>}
                      </div>
                    </Link>
                  </td>
                  {/* 13 cellules pastilles */}
                  {r.tasks.map((s, i) => (
                    <td
                      key={i}
                      className="px-1 py-1 text-center border-b border-zinc-100"
                      title={`${TASK_LONG_LABEL[taskKeys[i]] ?? taskKeys[i]} · ${statutLabel(s)}`}
                    >
                      <StatusDot statut={s} />
                    </td>
                  ))}
                  {/* Progression */}
                  <td className="px-2 py-2 border-b border-l border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden min-w-[40px]">
                        <div
                          className={cn(
                            "h-full transition-all",
                            r.total === 0
                              ? "bg-zinc-200"
                              : r.done === r.total
                              ? "bg-emerald-500"
                              : "bg-[hsl(var(--gold))]"
                          )}
                          style={{
                            width: r.total > 0 ? `${(r.done / r.total) * 100}%` : "0%",
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-zinc-600 shrink-0 min-w-[34px] text-right">
                        {r.total > 0 ? `${r.done}/${r.total}` : "—"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  StatusDot : pastille statut
// ============================================================================

function StatusDot({ statut }: { statut: StatutLogique | null }) {
  if (statut === null) {
    return (
      <span className="inline-block w-4 h-4 rounded border border-dashed border-zinc-200" />
    );
  }
  if (statut === "TERMINE") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300">
        <Check className="h-3 w-3 text-emerald-700" strokeWidth={3} />
      </span>
    );
  }
  if (statut === "NON_APPLICABLE") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 border border-zinc-300">
        <Minus className="h-3 w-3 text-zinc-500" strokeWidth={3} />
      </span>
    );
  }
  if (statut === "EN_COURS") {
    return (
      <span className="inline-block w-3 h-3 rounded-full bg-amber-400 border border-amber-500" />
    );
  }
  // A_FAIRE
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 border border-rose-200">
      <X className="h-3 w-3 text-rose-400" strokeWidth={2.5} />
    </span>
  );
}

function statutLabel(s: StatutLogique | null): string {
  if (s === null) return "Tâche non créée";
  if (s === "TERMINE") return "Terminé";
  if (s === "EN_COURS") return "En cours";
  if (s === "A_FAIRE") return "À faire";
  return "N/A";
}

// ============================================================================
//  LegendItem
// ============================================================================

function LegendItem({ statut, label }: { statut: StatutLogique; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot statut={statut} />
      {label}
    </span>
  );
}

// ============================================================================
//  FilterChip
// ============================================================================

function FilterChip({
  label,
  value,
  current,
  count,
  type,
  onClick,
}: {
  label: string;
  value: TypeFilter;
  current: TypeFilter;
  count: number;
  type?: OrigineType;
  onClick: () => void;
}) {
  const active = value === current;
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5",
        active && type
          ? `${TYPE_PILL[type]} shadow-sm`
          : active
          ? "bg-zinc-100 text-zinc-700 border-zinc-300 shadow-sm"
          : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "" : "text-zinc-400")}>{count}</span>
    </button>
  );
}
