"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { cn, statutColorClass } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import {
  createClientCaa,
  deleteClientCaa,
  setCaaFacturation,
  setCaaObligationStatut,
  toggleCaaSubscription,
  updateClientCaa,
  type EtatFacturation,
  type StatutLogique,
} from "./actions";
import { useConfirm } from "@/app/_components/confirm-modal";

export type CaaStatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

export type CaaCell = {
  annee: number;
  libelle: string | null;
  statut_logique: StatutLogique;
  etat_facturation: EtatFacturation | null;
};

export type CaaRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  forme: string | null;
  dirigeant_nom: string | null;
  dirigeant_email: string | null;
  dirigeant_telephone: string | null;
  ldm_statut: string;
  /** Map<annee, cell>. Absente = N/A pour l'annee. */
  obligations: Map<number, CaaCell>;
};

// Etats facturation : meme palette que missions exceptionnelles
const FACT_OPTIONS: Array<{ key: EtatFacturation; label: string; color: string }> = [
  { key: "a_facturer", label: "À facturer", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "facturee", label: "Facturée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
  { key: "sans_facture", label: "Sans facture", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
];

const LDM_VALUES: Array<{ key: string; label: string; color: string }> = [
  { key: "a_preparer", label: "À préparer", color: "bg-zinc-100 dark:bg-white/[0.10] text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-white/[0.18]" },
  { key: "propale_acceptee", label: "Propale acceptée", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "ldm_envoyee", label: "LDM envoyée", color: "bg-sky-50 dark:bg-sky-500/25 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/50" },
  { key: "ldm_signee", label: "LDM signée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
];

export default function CaaTable({
  rows,
  mode,
  selectedYear,
  center,
  years,
  statusOptions,
}: {
  rows: CaaRow[];
  mode: "base" | "year";
  selectedYear: number;
  /** Centre de la fenetre 3-ans (cf. IR pour la logique). */
  center: number;
  years: number[];
  statusOptions: CaaStatusOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);
  const { confirm, ConfirmDialog } = useConfirm();

  // Vue annee : on n'affiche QUE les clients souscrits a la CAA pour l'annee
  // selectionnee (sinon listing N/A pour tous, polluant). Vue base : tous.
  const visibleRows =
    mode === "year"
      ? localRows.filter((r) => r.obligations.has(selectedYear))
      : localRows;

  function onSetLdm(clientCaaId: string, newStatut: string) {
    setLocalRows((prev) =>
      prev.map((r) => (r.id === clientCaaId ? { ...r, ldm_statut: newStatut } : r))
    );
    startTransition(async () => {
      try {
        await updateClientCaa(clientCaaId, { ldm_statut: newStatut });
      } catch (e) {
        toastError(e, "Echec sauvegarde LDM");
      }
    });
  }

  function onToggleSubscription(clientCaaId: string, annee: number) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientCaaId) return r;
        const newMap = new Map(r.obligations);
        if (newMap.has(annee)) {
          newMap.delete(annee);
        } else {
          newMap.set(annee, { annee, libelle: "À préparer", statut_logique: "A_FAIRE", etat_facturation: null });
        }
        return { ...r, obligations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await toggleCaaSubscription(clientCaaId, annee);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec toggle souscription");
      }
    });
  }

  function onSetStatut(clientCaaId: string, libelle: string | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientCaaId) return r;
        const newMap = new Map(r.obligations);
        if (libelle === null) {
          newMap.delete(selectedYear);
        } else {
          const sl = statusOptions.find((o) => o.libelle === libelle)?.statut_logique ?? "A_FAIRE";
          const previous = newMap.get(selectedYear);
          newMap.set(selectedYear, {
            annee: selectedYear,
            libelle,
            statut_logique: sl,
            etat_facturation: previous?.etat_facturation ?? null,
          });
        }
        return { ...r, obligations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await setCaaObligationStatut(clientCaaId, selectedYear, libelle);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec sauvegarde statut CAA");
      }
    });
  }

  function onSetFacturation(clientCaaId: string, etat: EtatFacturation | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientCaaId) return r;
        const existing = r.obligations.get(selectedYear);
        if (!existing) return r;
        const newMap = new Map(r.obligations);
        newMap.set(selectedYear, { ...existing, etat_facturation: etat });
        return { ...r, obligations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await setCaaFacturation(clientCaaId, selectedYear, etat);
      } catch (e) {
        toastError(e, "Echec sauvegarde facturation");
        router.refresh();
      }
    });
  }

  async function onDelete(clientCaaId: string, denomination: string) {
    const ok = await confirm({
      title: `Supprimer ${denomination} ?`,
      description: "Le dossier CAA et ses obligations seront supprimes.",
      variant: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setLocalRows((prev) => prev.filter((r) => r.id !== clientCaaId));
    startTransition(async () => {
      try {
        await deleteClientCaa(clientCaaId);
        toastSuccess("Dossier CAA supprime");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec suppression");
      }
    });
  }

  // Recap par annee : compte les missions CAA par statut_logique pour le
  // sommaire au-dessus du tableau.
  const yearRecap = useMemo(() => {
    type Stats = { a_faire: number; en_cours: number; termine: number };
    const map = new Map<number, Stats>();
    for (const r of localRows) {
      for (const cell of r.obligations.values()) {
        if (!map.has(cell.annee)) map.set(cell.annee, { a_faire: 0, en_cours: 0, termine: 0 });
        const s = map.get(cell.annee)!;
        if (cell.statut_logique === "A_FAIRE") s.a_faire++;
        else if (cell.statut_logique === "EN_COURS") s.en_cours++;
        else if (cell.statut_logique === "TERMINE") s.termine++;
      }
    }
    return map;
  }, [localRows]);
  function statsFor(year: number): { a_faire: number; en_cours: number; termine: number } {
    return yearRecap.get(year) ?? { a_faire: 0, en_cours: 0, termine: 0 };
  }

  function urlForBase(c: number = center) {
    return `/missions/caa?view=base&center=${c}`;
  }
  function urlForYear(y: number) {
    return `/missions/caa?year=${y}`;
  }
  const prevCenter = center - 1;
  const nextCenter = center + 1;
  const urlPrev = mode === "year" ? urlForYear(prevCenter) : urlForBase(prevCenter);
  const urlNext = mode === "year" ? urlForYear(nextCenter) : urlForBase(nextCenter);

  return (
    <div className={cn("space-y-3", isPending && "opacity-95")}>
      {ConfirmDialog}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav
          aria-label="Vue tracker CAA"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]"
        >
          <Link
            href={urlForBase()}
            aria-current={mode === "base" ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-all",
              mode === "base"
                ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
            )}
          >
            Base
          </Link>
          <Link
            href={urlPrev}
            aria-label="Année précédente"
            title={`Reculer (${prevCenter - 1} à ${prevCenter + 1})`}
            className="px-1.5 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          {years.map((y) => {
            const active = mode === "year" && y === selectedYear;
            return (
              <Link
                key={y}
                href={urlForYear(y)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm tabular-nums transition-all",
                  active
                    ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
                )}
              >
                {y}
              </Link>
            );
          })}
          <Link
            href={urlNext}
            aria-label="Année suivante"
            title={`Avancer (${nextCenter - 1} à ${nextCenter + 1})`}
            className="px-1.5 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau dossier CAA
          </button>
        )}
      </div>

      {/* Recap par annee : sommaire CAA pour la fenetre 3-ans courante. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {years.map((y) => {
          const stats = statsFor(y);
          const total = stats.a_faire + stats.en_cours + stats.termine;
          const pct = total > 0 ? Math.round((stats.termine / total) * 100) : 0;
          const active = mode === "year" && y === selectedYear;
          return (
            <Link
              key={y}
              href={urlForYear(y)}
              className={cn(
                "block rounded-xl border bg-white dark:bg-[hsl(var(--card))] shadow-card p-3 space-y-2 transition-colors",
                active
                  ? "border-zinc-400 dark:border-white/30 ring-1 ring-zinc-300 dark:ring-white/20"
                  : "border-zinc-200 dark:border-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.16]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{y}</span>
                {total === 0 && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">aucune souscription</span>
                )}
              </div>
              {total > 0 && <CaaRecapLine stats={stats} pct={pct} />}
            </Link>
          );
        })}
      </div>

      {adding && (
        <NewClientCaaForm onCancel={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} />
      )}

      {editingId && (() => {
        const target = localRows.find((r) => r.id === editingId);
        if (!target) return null;
        return (
          <EditClientCaaModal
            row={target}
            onClose={() => setEditingId(null)}
            onSaved={(patch) => {
              setLocalRows((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...patch } : r)));
              setEditingId(null);
              router.refresh();
            }}
          />
        );
      })()}

      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          {localRows.length === 0
            ? "Aucune mission CAA. Clique sur « Nouveau dossier CAA » pour commencer."
            : `Aucune mission souscrite pour l'exercice ${selectedYear}. Passe en vue « Base » pour souscrire des années.`}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm" aria-label="Dossiers CAA">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Société</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Dirigeant</th>
                {mode === "base" ? (
                  <>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Statut LDM</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">CAA · années</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-4 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400">CAA {selectedYear}</th>
                    <th scope="col" className="px-4 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400">Facturation</th>
                  </>
                )}
                <th scope="col" className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {visibleRows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.denomination}</span>
                      {(r.siren || r.forme) && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {[r.siren, r.forme].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {r.dirigeant_nom && <div className="font-medium text-zinc-700 dark:text-zinc-300">{r.dirigeant_nom}</div>}
                    {r.dirigeant_email && <div className="truncate max-w-[180px]">{r.dirigeant_email}</div>}
                  </td>
                  {mode === "base" ? (
                    <>
                      <td className="px-4 py-3">
                        <LdmPicker value={r.ldm_statut} onChange={(v) => onSetLdm(r.id, v)} />
                      </td>
                      <td className="px-4 py-3">
                        <YearPills
                          years={years}
                          subscribedYears={new Set(r.obligations.keys())}
                          onToggle={(year) => onToggleSubscription(r.id, year)}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-3 text-center">
                        <StatutCell
                          cell={r.obligations.get(selectedYear) ?? null}
                          options={statusOptions}
                          onPick={(libelle) => onSetStatut(r.id, libelle)}
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
                        <FacturationPicker
                          value={r.obligations.get(selectedYear)?.etat_facturation ?? null}
                          onChange={(v) => onSetFacturation(r.id, v)}
                          disabled={!r.obligations.has(selectedYear)}
                        />
                      </td>
                    </>
                  )}
                  <td className="px-2 py-3 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        onClick={() => setEditingId(r.id)}
                        className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
                        aria-label={`Modifier ${r.denomination}`}
                        title="Modifier le dossier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(r.id, r.denomination)}
                        className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        aria-label={`Supprimer ${r.denomination}`}
                        title="Supprimer le dossier"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        {visibleRows.length} mission{visibleRows.length > 1 ? "s" : ""} CAA
        {mode === "year" ? ` souscrite${visibleRows.length > 1 ? "s" : ""} - exercice ${selectedYear}` : " - vue d'ensemble"}
        {mode === "year" && localRows.length !== visibleRows.length && ` (sur ${localRows.length} au total)`}.
      </p>
    </div>
  );
}

// ============================================================================
//  YearPills (idem IR)
// ============================================================================

// ============================================================================
//  CaaRecapLine - ligne de stats pour le sommaire par annee.
// ============================================================================

function CaaRecapLine({
  stats,
  pct,
}: {
  stats: { a_faire: number; en_cours: number; termine: number };
  pct: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
          <span className={cn(stats.a_faire > 0 ? "text-rose-600 dark:text-rose-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
            {stats.a_faire} à faire
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className={cn(stats.en_cours > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
            {stats.en_cours} en cours
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className={cn(stats.termine > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
            {stats.termine} fait
          </span>
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-emerald-500 dark:bg-emerald-400/70 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function YearPills({
  years,
  subscribedYears,
  onToggle,
}: {
  years: number[];
  subscribedYears: Set<number>;
  onToggle: (year: number) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {years.map((y) => {
        const subscribed = subscribedYears.has(y);
        return (
          <button
            key={y}
            type="button"
            onClick={() => onToggle(y)}
            aria-pressed={subscribed}
            title={subscribed ? `Souscrit ${y} · clic pour retirer` : `Non souscrit ${y} · clic pour ajouter`}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] tabular-nums font-medium border transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
              subscribed
                ? "bg-zinc-200 dark:bg-white/[0.14] text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-white/[0.20]"
                : "bg-transparent text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10] hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
//  StatutCell (idem IR mais sans type)
// ============================================================================

function StatutCell({
  cell,
  options,
  onPick,
}: {
  cell: CaaCell | null;
  options: CaaStatusOption[];
  onPick: (libelle: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!open || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-statut-btn]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 200;
    const POPOVER_WIDTH = 220;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const rawLeft = rect.left + rect.width / 2;
    const halfW = POPOVER_WIDTH / 2;
    const clampedLeft = Math.max(
      MARGIN + halfW,
      Math.min(rawLeft, window.innerWidth - MARGIN - halfW)
    );
    setPos({ left: clampedLeft, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isSubscribed = cell !== null;

  return (
    <div ref={ref} className="inline-block">
      <button
        data-statut-btn="1"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-block min-w-[110px] px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
          isSubscribed
            ? statutColorClass(cell!.statut_logique, null)
            : "bg-violet-50 dark:bg-violet-500/15 border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300"
        )}
      >
        {isSubscribed ? cell!.libelle ?? "À préparer" : "N/A"}
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translate(-50%, calc(-100% - 8px))" : "translate(-50%, 8px)",
              zIndex: 1000,
            }}
            className="min-w-[220px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b dark:border-white/[0.06]">
              Statut CAA
            </div>
            <div className="py-1 max-h-[260px] overflow-y-auto">
              {options.map((o) => (
                <button
                  key={o.libelle}
                  type="button"
                  onClick={() => {
                    onPick(o.libelle);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                    cell?.libelle === o.libelle && "bg-zinc-50 dark:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", statutColorClass(o.statut_logique, o.color))}>
                    {o.libelle}
                  </span>
                  {cell?.libelle === o.libelle && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
            {isSubscribed && (
              <div className="border-t dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Marquer N/A (désouscrire de cette année)
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  LdmPicker
// ============================================================================

function LdmPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = LDM_VALUES.find((v) => v.key === value) ?? LDM_VALUES[0];

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = LDM_VALUES.length * 32 + 16;
    const POPOVER_WIDTH = 200;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
          current.color
        )}
      >
        {current.label}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)",
              zIndex: 1000,
            }}
            className="min-w-[200px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {LDM_VALUES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => {
                  onChange(v.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                  value === v.key && "bg-zinc-50 dark:bg-white/[0.04]"
                )}
              >
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", v.color)}>{v.label}</span>
                {value === v.key && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  FacturationPicker - 4 etats. Disabled si pas de souscription pour l'annee.
// ============================================================================

function FacturationPicker({
  value,
  onChange,
  disabled,
}: {
  value: EtatFacturation | null;
  onChange: (v: EtatFacturation | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = value ? FACT_OPTIONS.find((o) => o.key === value) : null;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = FACT_OPTIONS.length * 32 + 50;
    const POPOVER_WIDTH = 200;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (disabled) {
    return <span className="text-zinc-300 dark:text-zinc-600 text-xs italic">-</span>;
  }

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 min-w-[90px] justify-center",
          current
            ? current.color
            : "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]"
        )}
      >
        {current ? current.label : "-"}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)",
              zIndex: 1000,
            }}
            className="min-w-[200px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {FACT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                  value === o.key && "bg-zinc-50 dark:bg-white/[0.04]"
                )}
              >
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>{o.label}</span>
                {value === o.key && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
              </button>
            ))}
            {value !== null && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
              >
                Réinitialiser
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  EditClientCaaModal - modifie un dossier CAA existant
// ============================================================================

function EditClientCaaModal({
  row,
  onClose,
  onSaved,
}: {
  row: CaaRow;
  onClose: () => void;
  onSaved: (patch: Partial<CaaRow>) => void;
}) {
  const [denomination, setDenomination] = useState(row.denomination);
  const [siren, setSiren] = useState(row.siren ?? "");
  const [forme, setForme] = useState(row.forme ?? "");
  const [dirigeantNom, setDirigeantNom] = useState(row.dirigeant_nom ?? "");
  const [dirigeantEmail, setDirigeantEmail] = useState(row.dirigeant_email ?? "");
  const [dirigeantTelephone, setDirigeantTelephone] = useState(row.dirigeant_telephone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!denomination.trim()) {
      setError("Dénomination obligatoire");
      return;
    }
    setError(null);
    const patch: Record<string, string | null> = {
      denomination: denomination.trim(),
      siren: siren.trim() || null,
      forme: forme.trim() || null,
      dirigeant_nom: dirigeantNom.trim() || null,
      dirigeant_email: dirigeantEmail.trim() || null,
      dirigeant_telephone: dirigeantTelephone.trim() || null,
    };
    startTransition(async () => {
      try {
        await updateClientCaa(row.id, patch);
        toastSuccess("Dossier mis à jour");
        onSaved({
          denomination: denomination.trim(),
          siren: siren.trim() || null,
          forme: forme.trim() || null,
          dirigeant_nom: dirigeantNom.trim() || null,
          dirigeant_email: dirigeantEmail.trim() || null,
          dirigeant_telephone: dirigeantTelephone.trim() || null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastError(e, "Echec mise à jour");
      }
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Modifier {row.denomination}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={denomination} onChange={(e) => setDenomination(e.target.value)} placeholder="Dénomination *" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm" />
            <input value={siren} onChange={(e) => setSiren(e.target.value.replace(/\D/g, ""))} maxLength={9} inputMode="numeric" placeholder="SIREN" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums" />
            <input value={forme} onChange={(e) => setForme(e.target.value)} placeholder="Forme (SAS, SARL...)" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm" />
            <input value={dirigeantNom} onChange={(e) => setDirigeantNom(e.target.value)} placeholder="Dirigeant (nom complet)" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm" />
            <input value={dirigeantEmail} onChange={(e) => setDirigeantEmail(e.target.value)} placeholder="Email dirigeant" type="email" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm sm:col-span-2" />
            <input value={dirigeantTelephone} onChange={(e) => setDirigeantTelephone(e.target.value)} placeholder="Téléphone dirigeant" type="tel" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums" />
          </div>
          {error && <div className="text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
        </div>

        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isPending} className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={isPending || !denomination.trim()} className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isPending ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
//  NewClientCaaForm
// ============================================================================

function NewClientCaaForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [denomination, setDenomination] = useState("");
  const [siren, setSiren] = useState("");
  const [forme, setForme] = useState("");
  const [dirigeantNom, setDirigeantNom] = useState("");
  const [dirigeantEmail, setDirigeantEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!denomination.trim()) {
      setError("Dénomination obligatoire");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createClientCaa({
          denomination,
          siren: siren || null,
          forme: forme || null,
          dirigeant_nom: dirigeantNom || null,
          dirigeant_email: dirigeantEmail || null,
        });
        toastSuccess("Dossier CAA cree");
        onCreated();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastError(e, "Echec creation");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-4 shadow-card space-y-3">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nouveau dossier CAA</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          value={denomination}
          onChange={(e) => setDenomination(e.target.value)}
          placeholder="Dénomination *"
          autoFocus
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={siren}
          onChange={(e) => setSiren(e.target.value.replace(/\D/g, ""))}
          maxLength={9}
          inputMode="numeric"
          pattern="[0-9]{9}"
          placeholder="SIREN (9 chiffres)"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums"
        />
        <input
          value={forme}
          onChange={(e) => setForme(e.target.value)}
          placeholder="Forme (SAS, SARL...)"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={dirigeantNom}
          onChange={(e) => setDirigeantNom(e.target.value)}
          placeholder="Dirigeant (nom complet)"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={dirigeantEmail}
          onChange={(e) => setDirigeantEmail(e.target.value)}
          placeholder="Email dirigeant"
          type="email"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm sm:col-span-2"
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      {error && <div className="text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !denomination.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Création…" : "Créer"}
        </button>
      </div>
    </div>
  );
}
