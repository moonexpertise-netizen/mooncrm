"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown, Coins } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { isClientBillable } from "@/lib/billable";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { EmptyState } from "@/app/_components/ui";
import { updateClient } from "@/app/clients/[slug]/actions";

export type HonoRow = {
  id: string;
  slug: string;
  denomination: string;
  pipeline_statut: string | null;
  origine: string | null;
  /** Forfait comptable MENSUEL. */
  honoraires_compta: number;
  type_honos_bilans: "Inclus" | "Facturés" | null;
  /** Forfait bilan ANNUEL (pertinent si type = Facturés). */
  forfait_bilan: number;
  tdb_periode: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
  /** Montant du pilotage PAR PÉRIODE (mois ou trimestre selon tdb_periode). */
  tdb_honos_periode: number;
  /** Équivalent MENSUEL du pilotage (calculé côté DB). */
  forfait_pilotage: number;
  type_honos_jur: "Facturés" | "Inclus" | "Non souscrit" | null;
  /** Forfait juridique ANNUEL (pertinent si type = Facturés). */
  honoraires_jur: number;
  mrr: number;
  arr: number;
};

type SortKey = "denomination" | "compta" | "bilan" | "pilotage" | "jur" | "mrr";
type EditableField = "honoraires_compta" | "forfait_bilan" | "tdb_honos_periode" | "honoraires_jur";

export default function HonorairesGrid({ rows }: { rows: HonoRow[] }) {
  const canEdit = useCan("edit_honoraires");
  const [localRows, setLocalRows] = useState(rows);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"facturables" | "tous">("facturables");
  const [sortKey, setSortKey] = useState<SortKey>("denomination");
  const [sortAsc, setSortAsc] = useState(true);
  const [, startTransition] = useTransition();

  // ---- Filtrage (périmètre + recherche) ------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localRows.filter((r) => {
      if (scope === "facturables" && !isClientBillable(r)) return false;
      if (q && !r.denomination.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [localRows, scope, search]);

  // ---- Tri ------------------------------------------------------------------
  const sorted = useMemo(() => {
    const val = (r: HonoRow): number | string => {
      switch (sortKey) {
        case "compta": return r.honoraires_compta;
        case "bilan": return r.type_honos_bilans === "Facturés" ? r.forfait_bilan : -1;
        case "pilotage": return r.tdb_periode === "Mensuel" || r.tdb_periode === "Trimestriel" ? r.forfait_pilotage : -1;
        case "jur": return r.type_honos_jur === "Facturés" ? r.honoraires_jur : -1;
        case "mrr": return r.mrr;
        default: return r.denomination;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === "string"
        ? va.localeCompare(String(vb), "fr")
        : (va as number) - (vb as number);
      return sortAsc ? c : -c;
    });
  }, [filtered, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      // Les colonnes numériques démarrent en desc (les gros montants d'abord)
      setSortAsc(key === "denomination");
    }
  }

  // ---- Totaux (sur le périmètre filtré) --------------------------------------
  const totals = useMemo(() => {
    let compta = 0, bilan = 0, pilotage = 0, jur = 0;
    for (const r of filtered) {
      compta += r.honoraires_compta;
      if (r.type_honos_bilans === "Facturés") bilan += r.forfait_bilan;
      if (r.tdb_periode === "Mensuel" || r.tdb_periode === "Trimestriel") pilotage += r.forfait_pilotage;
      if (r.type_honos_jur === "Facturés") jur += r.honoraires_jur;
    }
    return { compta, bilan, pilotage, jur };
  }, [filtered]);

  // ---- Édition inline ---------------------------------------------------------
  function commit(row: HonoRow, field: EditableField, value: number) {
    // Optimiste : maj locale immédiate. Pour le pilotage, on recalcule aussi
    // l'équivalent mensuel local (la DB le fait de son côté).
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== row.id) return r;
        const next = { ...r, [field]: value };
        if (field === "tdb_honos_periode") {
          next.forfait_pilotage =
            r.tdb_periode === "Trimestriel" ? Math.round((value / 3) * 100) / 100 : value;
        }
        return next;
      })
    );
    startTransition(async () => {
      try {
        await updateClient(row.id, { [field]: value });
      } catch (e) {
        toastError(e, "Echec de la sauvegarde");
        // Retour à la valeur serveur d'origine
        setLocalRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      }
    });
  }

  const thBtn =
    "inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors";

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-50" />;
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  return (
    <div className="space-y-4">
      {/* KPI : totaux par nature, sur le périmètre affiché */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-in">
        <Kpi label="Compta" value={`${fmtEuro(Math.round(totals.compta))} /mois`} sub={`${fmtEuro(Math.round(totals.compta * 12))} /an`} />
        <Kpi label="Bilans facturés" value={`${fmtEuro(Math.round(totals.bilan))} /an`} sub="type_honos_bilans = Facturés" />
        <Kpi label="Pilotage" value={`${fmtEuro(Math.round(totals.pilotage))} /mois`} sub={`${fmtEuro(Math.round(totals.pilotage * 12))} /an`} />
        <Kpi label="Juridique facturé" value={`${fmtEuro(Math.round(totals.jur))} /an`} sub="type_honos_jur = Facturés" />
      </div>

      {/* Toolbar : recherche + périmètre */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par dossier…"
          className="h-9 w-full sm:w-64 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        />
        <div className="flex items-center gap-1">
          {(["facturables", "tous"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
                scope === s
                  ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 border-transparent"
                  : "bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.08]"
              )}
            >
              {s === "facturables" ? "Dossiers facturables" : "Tous les dossiers"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {sorted.length} dossier{sorted.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Grille */}
      {sorted.length === 0 ? (
        <EmptyState
          icon={<Coins />}
          title="Aucun dossier"
          description="Aucun dossier ne correspond au filtre courant."
        />
      ) : (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02]">
                <th className="px-3 py-2.5 font-medium">
                  <button type="button" onClick={() => toggleSort("denomination")} className={thBtn}>
                    Client <SortIcon col="denomination" />
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  <button type="button" onClick={() => toggleSort("compta")} className={thBtn}>
                    Compta /mois <SortIcon col="compta" />
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  <button type="button" onClick={() => toggleSort("bilan")} className={thBtn}>
                    Bilan /an <SortIcon col="bilan" />
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  <button type="button" onClick={() => toggleSort("pilotage")} className={thBtn}>
                    Pilotage <SortIcon col="pilotage" />
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  <button type="button" onClick={() => toggleSort("jur")} className={thBtn}>
                    Juridique /an <SortIcon col="jur" />
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  <button type="button" onClick={() => toggleSort("mrr")} className={thBtn}>
                    MRR <SortIcon col="mrr" />
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium text-right">ARR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/70 dark:hover:bg-white/[0.04] transition-colors">
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${r.slug}`}
                      className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline underline-offset-2"
                    >
                      {r.denomination}
                    </Link>
                  </td>
                  {/* Compta : toujours éditable */}
                  <td className="px-3 py-2 text-right">
                    <CellEuro
                      value={r.honoraires_compta}
                      canEdit={canEdit}
                      onCommit={(v) => commit(r, "honoraires_compta", v)}
                    />
                  </td>
                  {/* Bilan : montant si Facturés, badge sinon */}
                  <td className="px-3 py-2 text-right">
                    {r.type_honos_bilans === "Facturés" ? (
                      <CellEuro
                        value={r.forfait_bilan}
                        canEdit={canEdit}
                        onCommit={(v) => commit(r, "forfait_bilan", v)}
                      />
                    ) : (
                      <TypeBadge label={r.type_honos_bilans ?? "—"} />
                    )}
                  </td>
                  {/* Pilotage : montant par période si souscrit + équiv mensuel */}
                  <td className="px-3 py-2 text-right">
                    {r.tdb_periode === "Mensuel" || r.tdb_periode === "Trimestriel" ? (
                      <div className="inline-flex flex-col items-end">
                        <CellEuro
                          value={r.tdb_honos_periode}
                          canEdit={canEdit}
                          suffix={r.tdb_periode === "Mensuel" ? "/mois" : "/trim"}
                          onCommit={(v) => commit(r, "tdb_honos_periode", v)}
                        />
                        {r.tdb_periode === "Trimestriel" && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            = {fmtEuro(Math.round(r.forfait_pilotage))} /mois
                          </span>
                        )}
                      </div>
                    ) : (
                      <TypeBadge label="—" />
                    )}
                  </td>
                  {/* Juridique : montant si Facturés, badge sinon */}
                  <td className="px-3 py-2 text-right">
                    {r.type_honos_jur === "Facturés" ? (
                      <CellEuro
                        value={r.honoraires_jur}
                        canEdit={canEdit}
                        onCommit={(v) => commit(r, "honoraires_jur", v)}
                      />
                    ) : (
                      <TypeBadge label={r.type_honos_jur ?? "—"} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {fmtEuro(Math.round(r.mrr))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {fmtEuro(Math.round(r.arr))}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Ligne de totaux (périmètre affiché) */}
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-white/[0.10] bg-zinc-50/60 dark:bg-white/[0.02] font-semibold text-zinc-900 dark:text-zinc-100">
                <td className="px-3 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(Math.round(totals.compta))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(Math.round(totals.bilan))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(Math.round(totals.pilotage))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(Math.round(totals.jur))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtEuro(Math.round(filtered.reduce((s, r) => s + r.mrr, 0)))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtEuro(Math.round(filtered.reduce((s, r) => s + r.arr, 0)))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Les colonnes Bilan / Pilotage / Juridique n&apos;affichent un montant que si le forfait est
        facturé (sinon « Inclus » ou « — »). Pour changer un type Facturés / Inclus / Non souscrit,
        ouvre la fiche du dossier.
      </p>
    </div>
  );
}

// ============================================================================
//  Sous-composants
// ============================================================================

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums mt-1.5">
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
    </div>
  );
}

function TypeBadge({ label }: { label: string }) {
  if (label === "—") {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400">
      {label}
    </span>
  );
}

/**
 * Cellule euro éditable : montant cliquable -> input -> commit au blur/Entrée.
 * Échap annule. Sans droit d'édition, texte statique.
 */
function CellEuro({
  value,
  canEdit,
  suffix,
  onCommit,
}: {
  value: number;
  canEdit: boolean;
  suffix?: string;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commitDraft() {
    setEditing(false);
    const n = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n === value) return;
    onCommit(Math.round(n * 100) / 100);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        step={10}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitDraft();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] text-sm text-right tabular-nums text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
      />
    );
  }

  const display = (
    <>
      <span className="tabular-nums">{value > 0 ? fmtEuro(value) : "0 €"}</span>
      {suffix && <span className="text-[10px] text-muted-foreground ml-1">{suffix}</span>}
    </>
  );

  if (!canEdit) {
    return <span className="text-zinc-700 dark:text-zinc-300">{display}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ? String(value) : "");
        setEditing(true);
      }}
      title="Cliquer pour éditer"
      className={cn(
        "px-1.5 py-0.5 -mx-1.5 rounded-md transition-colors",
        "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
        value === 0 && "text-zinc-400 dark:text-zinc-500"
      )}
    >
      {display}
    </button>
  );
}
