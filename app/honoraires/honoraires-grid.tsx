"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown, Coins, Rocket, Check } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { EmptyState } from "@/app/_components/ui";
import { finirForfaitDebut } from "@/app/clients/[slug]/actions";
import AdjustHonorairesModal from "@/app/clients/[slug]/adjust-honoraires-modal";

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
  /** Guichet unique - OSS (toujours trimestriel). */
  oss_periode: "Trimestriel" | "Non souscrit" | null;
  /** Montant OSS PAR TRIMESTRE (source de vérité). */
  oss_honos_trimestre: number;
  /** Équivalent MENSUEL de l'OSS (calculé côté DB). */
  forfait_oss: number;
  type_honos_jur: "Facturés" | "Inclus" | "Non souscrit" | null;
  /** Forfait juridique ANNUEL (pertinent si type = Facturés). */
  honoraires_jur: number;
  // Forfait de début d'activité (impact LDM seul ; suivi ici).
  forfait_debut_montant: number;
  forfait_debut_date_debut: string | null;
  forfait_debut_condition: "Début de facturation" | "Nombre de mois" | "Date" | null;
  forfait_debut_nb_mois: number | null;
  forfait_debut_date_fin: string | null;
  forfait_debut_termine: boolean;
  forfait_debut_termine_at: string | null;
  mrr: number;
  arr: number;
};

type SortKey = "denomination" | "compta" | "bilan" | "pilotage" | "oss" | "jur" | "mrr";

export default function HonorairesGrid({ rows }: { rows: HonoRow[] }) {
  const canEdit = useCan("edit_honoraires");
  const [localRows] = useState(rows);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"ldm" | "tous">("ldm");
  const [sortKey, setSortKey] = useState<SortKey>("denomination");
  const [sortAsc, setSortAsc] = useState(true);

  // ---- Filtrage (périmètre + recherche) ------------------------------------
  // Périmètre par défaut : CLIENTS uniquement (pipeline "8 - LDM signée").
  // Les dossiers internes / sous-traitance / prospects sont exclus de la
  // grille des honoraires (demande Benjamin) ; "Tous" reste dispo en toggle.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localRows.filter((r) => {
      if (scope === "ldm" && r.pipeline_statut !== "8 - LDM signée") return false;
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
        case "oss": return r.oss_periode === "Trimestriel" ? r.forfait_oss : -1;
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
    let compta = 0, bilan = 0, pilotage = 0, oss = 0, jur = 0;
    for (const r of filtered) {
      compta += r.honoraires_compta;
      if (r.type_honos_bilans === "Facturés") bilan += r.forfait_bilan;
      if (r.tdb_periode === "Mensuel" || r.tdb_periode === "Trimestriel") pilotage += r.forfait_pilotage;
      if (r.oss_periode === "Trimestriel") oss += r.forfait_oss;
      if (r.type_honos_jur === "Facturés") jur += r.honoraires_jur;
    }
    return { compta, bilan, pilotage, oss, jur };
  }, [filtered]);

  const thBtn =
    "inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors";

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-50" />;
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  return (
    <div className="space-y-4">
      {/* Forfaits de début d'activité en cours (indépendant du filtre/périmètre) */}
      <ForfaitsDebutPanel rows={localRows} canEdit={canEdit} />

      {/* KPI : totaux par nature, sur le périmètre affiché */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger-in">
        <Kpi label="Compta" value={`${fmtEuro(Math.round(totals.compta))} /mois`} sub={`${fmtEuro(Math.round(totals.compta * 12))} /an`} />
        <Kpi label="Bilans facturés" value={`${fmtEuro(Math.round(totals.bilan))} /an`} sub="type_honos_bilans = Facturés" />
        <Kpi label="Pilotage" value={`${fmtEuro(Math.round(totals.pilotage))} /mois`} sub={`${fmtEuro(Math.round(totals.pilotage * 12))} /an`} />
        <Kpi label="Guichet OSS" value={`${fmtEuro(Math.round(totals.oss))} /mois`} sub={`${fmtEuro(Math.round(totals.oss * 12))} /an`} />
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
          {(["ldm", "tous"] as const).map((s) => (
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
              {s === "ldm" ? "Clients (LDM signée)" : "Tous les dossiers"}
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
          <table className="w-full text-sm min-w-[960px]">
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
                  <button type="button" onClick={() => toggleSort("oss")} className={thBtn}>
                    Guichet OSS <SortIcon col="oss" />
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
                <th className="px-2 py-2.5 font-medium text-right w-10"></th>
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
                  {/* Montants : LECTURE SEULE (édition via "Ajuster" -> motif). */}
                  <td className="px-3 py-2 text-right">
                    <CellEuro value={r.honoraires_compta} canEdit={false} />
                  </td>
                  {/* Bilan : montant si Facturés, badge sinon */}
                  <td className="px-3 py-2 text-right">
                    {r.type_honos_bilans === "Facturés" ? (
                      <CellEuro value={r.forfait_bilan} canEdit={false} />
                    ) : (
                      <TypeBadge label={r.type_honos_bilans ?? "—"} />
                    )}
                  </td>
                  {/* Pilotage : montant par période si souscrit + équiv mensuel */}
                  <td className="px-3 py-2 text-right">
                    {r.tdb_periode === "Mensuel" || r.tdb_periode === "Trimestriel" ? (
                      <div className="inline-flex flex-col items-end">
                        <CellEuro value={r.tdb_honos_periode} canEdit={false} suffix={r.tdb_periode === "Mensuel" ? "/mois" : "/trim"} />
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
                  {/* Guichet OSS : toujours trimestriel ; montant/trim + équiv mensuel */}
                  <td className="px-3 py-2 text-right">
                    {r.oss_periode === "Trimestriel" ? (
                      <div className="inline-flex flex-col items-end">
                        <CellEuro value={r.oss_honos_trimestre} canEdit={false} suffix="/trim" />
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          = {fmtEuro(Math.round(r.forfait_oss))} /mois
                        </span>
                      </div>
                    ) : (
                      <TypeBadge label="—" />
                    )}
                  </td>
                  {/* Juridique : montant si Facturés, badge sinon */}
                  <td className="px-3 py-2 text-right">
                    {r.type_honos_jur === "Facturés" ? (
                      <CellEuro value={r.honoraires_jur} canEdit={false} />
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
                  <td className="px-2 py-2 text-right">
                    <AdjustHonorairesModal
                      compact
                      clientId={r.id}
                      compta={r.honoraires_compta}
                      typeBilan={r.type_honos_bilans}
                      forfaitBilan={r.forfait_bilan}
                      typeJur={r.type_honos_jur}
                      honosJur={r.honoraires_jur}
                      tdbPeriode={r.tdb_periode}
                      tdbHonosPeriode={r.tdb_honos_periode}
                      ossPeriode={r.oss_periode}
                      ossHonosTrimestre={r.oss_honos_trimestre}
                    />
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
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(Math.round(totals.oss))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(Math.round(totals.jur))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtEuro(Math.round(filtered.reduce((s, r) => s + r.mrr, 0)))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtEuro(Math.round(filtered.reduce((s, r) => s + r.arr, 0)))}
                </td>
                <td className="px-2 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Les colonnes Bilan / Pilotage / Guichet OSS / Juridique n&apos;affichent un montant que si le
        forfait est souscrit / facturé (sinon « Inclus » ou « — »). Le Guichet OSS est toujours
        trimestriel. Pour changer un type Facturés / Inclus / Non souscrit, ouvre la fiche du dossier.
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
  onCommit?: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commitDraft() {
    setEditing(false);
    const n = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n === value) return;
    onCommit?.(Math.round(n * 100) / 100);
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

// ============================================================================
//  Panneau "Forfaits de début en cours"
// ============================================================================

function fmtDateFr(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function forfaitDebutSummary(r: HonoRow): string {
  const parts: string[] = [];
  if (r.forfait_debut_date_debut) parts.push(`dès le ${fmtDateFr(r.forfait_debut_date_debut)}`);
  if (r.forfait_debut_condition === "Date" && r.forfait_debut_date_fin) {
    parts.push(`jusqu'au ${fmtDateFr(r.forfait_debut_date_fin)}`);
  } else if (r.forfait_debut_condition === "Nombre de mois" && r.forfait_debut_nb_mois) {
    parts.push(`pendant ${r.forfait_debut_nb_mois} mois`);
  } else if (r.forfait_debut_condition === "Début de facturation") {
    parts.push("jusqu'au début de facturation");
  }
  return parts.join(" · ");
}

function ForfaitsDebutPanel({ rows, canEdit }: { rows: HonoRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"en_cours" | "archives">("en_cours");

  const withForfait = rows.filter((r) => r.forfait_debut_montant > 0);
  const active = withForfait.filter((r) => !r.forfait_debut_termine && !done.has(r.id));
  const archived = withForfait.filter((r) => r.forfait_debut_termine || done.has(r.id));
  if (withForfait.length === 0) return null;

  const shown = tab === "en_cours" ? active : archived;

  function terminer(r: HonoRow) {
    setDone((prev) => new Set(prev).add(r.id)); // retrait optimiste de "en cours"
    startTransition(async () => {
      try {
        await finirForfaitDebut(r.id);
        toastSuccess(`${r.denomination} : forfait de début clôturé`);
        router.refresh();
      } catch (e) {
        setDone((prev) => {
          const n = new Set(prev);
          n.delete(r.id);
          return n;
        });
        toastError(e, "Echec de la clôture du forfait de début");
      }
    });
  }

  return (
    <div className="rounded-xl border border-[hsl(var(--gold))]/25 bg-[hsl(var(--gold))]/[0.05] dark:bg-[hsl(var(--gold))]/[0.06] p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Rocket className="h-4 w-4 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Forfaits de début</h2>
        <div className="ml-auto inline-flex items-center gap-1 p-0.5 rounded-lg bg-white/60 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
          {([["en_cours", `En cours (${active.length})`], ["archives", `Archivés (${archived.length})`]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                tab === k
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 shadow-card"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          {tab === "en_cours" ? "Aucun forfait de début en cours." : "Aucun forfait de début archivé."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex items-center gap-3 flex-wrap rounded-lg bg-white dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.08] px-3 py-2",
                tab === "archives" && "opacity-75"
              )}
            >
              <Link
                href={`/clients/${r.slug}`}
                className="font-medium text-sm text-zinc-900 dark:text-zinc-100 hover:underline underline-offset-2 min-w-0 truncate"
              >
                {r.denomination}
              </Link>
              <span className="text-xs tabular-nums text-zinc-700 dark:text-zinc-300 shrink-0">
                {fmtEuro(r.forfait_debut_montant)} /mois
              </span>
              <span className="text-[11px] text-muted-foreground min-w-0 truncate">
                {forfaitDebutSummary(r)}
              </span>
              {tab === "archives" ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {r.forfait_debut_termine_at ? `Clôturé le ${fmtDateFr(r.forfait_debut_termine_at)}` : "Clôturé"}
                </span>
              ) : (
                canEdit && (
                  <button
                    type="button"
                    onClick={() => terminer(r)}
                    className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
                    title="Clôturer le forfait de début (rythme de croisière atteint)"
                  >
                    <Check className="h-3.5 w-3.5" /> Rythme de croisière
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground mt-2">
        « Rythme de croisière » clôt le forfait de début (il passe dans « Archivés » et la lettre de
        mission ne mentionne plus le tarif réduit). L'historique des remises accordées est conservé.
      </p>
    </div>
  );
}
