"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { cn, statutColorClass } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import {
  createClientIr,
  deleteClientIr,
  setIrObligationStatut,
  toggleIrSubscription,
  updateClientIr,
  type IrType,
  type StatutLogique,
} from "./actions";
import { useConfirm } from "@/app/_components/confirm-modal";

export type IrStatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

export type IrObligationCell = {
  annee: number;
  type: IrType;
  libelle: string | null;
  statut_logique: StatutLogique;
};

export type IrRow = {
  id: string;
  slug: string;
  civilite: "M." | "Mme" | "Mlle" | null;
  prenom: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  ldm_statut: string;
  /** Map "YYYY|IR" ou "YYYY|IFI" -> cell. Si la cle est absente, le client
   *  n'est pas souscrit a cette annee/type (= N/A dans la vue annee). */
  obligations: Map<string, IrObligationCell>;
};

// Mini-pipeline LDM (4 statuts hardcodes pour l'instant - pourra etre
// migre en status_options scope='ldm_mission' quand Benjamin donnera la
// liste finale)
const LDM_VALUES: Array<{ key: string; label: string; color: string }> = [
  { key: "a_preparer", label: "À préparer", color: "bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/[0.12]" },
  { key: "propale_acceptee", label: "Propale acceptée", color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30" },
  { key: "ldm_envoyee", label: "LDM envoyée", color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30" },
  { key: "ldm_signee", label: "LDM signée", color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30" },
];

export default function IrTable({
  rows,
  mode,
  selectedYear,
  years,
  statusOptions,
}: {
  rows: IrRow[];
  mode: "base" | "year";
  selectedYear: number;
  years: number[];
  statusOptions: Record<string, IrStatusOption[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);
  const { confirm, ConfirmDialog } = useConfirm();

  // Vue annee : on n'affiche QUE les clients souscrits a IR ou IFI pour
  // l'annee selectionnee (sinon on listerait "N/A" pour tous, ce qui pollue).
  // Vue base : on affiche tous les clients (c'est le seul endroit pour souscrire).
  const visibleRows =
    mode === "year"
      ? localRows.filter(
          (r) =>
            r.obligations.has(`${selectedYear}|IR`) ||
            r.obligations.has(`${selectedYear}|IFI`)
        )
      : localRows;

  function onSetLdm(clientIrId: string, newStatut: string) {
    setLocalRows((prev) =>
      prev.map((r) => (r.id === clientIrId ? { ...r, ldm_statut: newStatut } : r))
    );
    startTransition(async () => {
      try {
        await updateClientIr(clientIrId, { ldm_statut: newStatut });
      } catch (e) {
        toastError(e, "Echec sauvegarde LDM");
      }
    });
  }

  function onToggleSubscription(clientIrId: string, annee: number, type: IrType) {
    // Optimistic : on toggle la cell dans la map
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const key = `${annee}|${type}`;
        const newMap = new Map(r.obligations);
        if (newMap.has(key)) {
          newMap.delete(key);
        } else {
          newMap.set(key, {
            annee,
            type,
            libelle: "À faire",
            statut_logique: "A_FAIRE",
          });
        }
        return { ...r, obligations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await toggleIrSubscription(clientIrId, annee, type);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec toggle souscription");
      }
    });
  }

  function onSetStatut(clientIrId: string, type: IrType, libelle: string | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const key = `${selectedYear}|${type}`;
        const newMap = new Map(r.obligations);
        if (libelle === null) {
          newMap.delete(key);
        } else {
          const opts = statusOptions[`${type}_ANNEE`] ?? [];
          const sl = opts.find((o) => o.libelle === libelle)?.statut_logique ?? "A_FAIRE";
          newMap.set(key, { annee: selectedYear, type, libelle, statut_logique: sl });
        }
        return { ...r, obligations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await setIrObligationStatut(clientIrId, selectedYear, type, libelle);
        router.refresh();
      } catch (e) {
        toastError(e, `Echec sauvegarde ${type}`);
      }
    });
  }

  async function onDelete(clientIrId: string, fullName: string) {
    const ok = await confirm({
      title: `Supprimer ${fullName} ?`,
      description: "Le dossier IR + toutes ses obligations annuelles seront supprimes.",
      variant: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setLocalRows((prev) => prev.filter((r) => r.id !== clientIrId));
    startTransition(async () => {
      try {
        await deleteClientIr(clientIrId);
        toastSuccess("Dossier IR supprime");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec suppression");
      }
    });
  }

  // URL helpers pour les onglets Base / Year
  function urlForBase() {
    return "/missions/ir?view=base";
  }
  function urlForYear(y: number) {
    return `/missions/ir?year=${y}`;
  }

  return (
    <div className={cn("space-y-3", isPending && "opacity-95")}>
      {ConfirmDialog}

      {/* Onglets Base / Year + bouton ajouter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav
          aria-label="Vue tracker IR"
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
        </nav>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau dossier IR
          </button>
        )}
      </div>

      {adding && (
        <NewClientIrForm onCancel={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} />
      )}

      {/* Table */}
      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          {localRows.length === 0
            ? "Aucun dossier IR pour l'instant. Clique sur « Nouveau dossier IR » pour commencer."
            : `Aucun dossier souscrit pour l'exercice ${selectedYear}. Passe en vue « Base » pour souscrire des années.`}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm" aria-label="Dossiers IR">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Nom</th>
                {mode === "base" ? (
                  <>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Statut LDM</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">IR · années</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">IFI · années</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-4 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400">IR {selectedYear}</th>
                    <th scope="col" className="px-4 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400">IFI {selectedYear}</th>
                  </>
                )}
                <th scope="col" className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {visibleRows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {[r.civilite, r.prenom, r.nom].filter(Boolean).join(" ")}
                      </span>
                      {(r.email || r.telephone) && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[280px]">
                          {[r.email, r.telephone].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </td>
                  {mode === "base" ? (
                    <>
                      <td className="px-4 py-3">
                        <LdmPicker value={r.ldm_statut} onChange={(v) => onSetLdm(r.id, v)} />
                      </td>
                      <td className="px-4 py-3">
                        <YearPills
                          years={years}
                          subscribedYears={new Set(
                            Array.from(r.obligations.values())
                              .filter((c) => c.type === "IR")
                              .map((c) => c.annee)
                          )}
                          onToggle={(year) => onToggleSubscription(r.id, year, "IR")}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <YearPills
                          years={years}
                          subscribedYears={new Set(
                            Array.from(r.obligations.values())
                              .filter((c) => c.type === "IFI")
                              .map((c) => c.annee)
                          )}
                          onToggle={(year) => onToggleSubscription(r.id, year, "IFI")}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-3 text-center">
                        <StatutCell
                          cell={r.obligations.get(`${selectedYear}|IR`) ?? null}
                          options={statusOptions["IR_ANNEE"] ?? []}
                          onPick={(libelle) => onSetStatut(r.id, "IR", libelle)}
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
                        <StatutCell
                          cell={r.obligations.get(`${selectedYear}|IFI`) ?? null}
                          options={statusOptions["IFI_ANNEE"] ?? []}
                          onPick={(libelle) => onSetStatut(r.id, "IFI", libelle)}
                        />
                      </td>
                    </>
                  )}
                  <td className="px-2 py-3 text-right">
                    <button
                      onClick={() => onDelete(r.id, [r.prenom, r.nom].filter(Boolean).join(" "))}
                      className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                      aria-label={`Supprimer ${r.nom}`}
                      title="Supprimer le dossier"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        {visibleRows.length} dossier{visibleRows.length > 1 ? "s" : ""} IR
        {mode === "year" ? ` souscrit${visibleRows.length > 1 ? "s" : ""} - exercice ${selectedYear}` : " - vue d'ensemble"}
        {mode === "year" && localRows.length !== visibleRows.length && ` (sur ${localRows.length} au total)`}.
      </p>
    </div>
  );
}

// ============================================================================
//  YearPills - pills cliquables pour activer/desactiver une annee (vue Base)
// ============================================================================

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
//  StatutCell - picker statut style Notion (utilise dans vue annee)
//  Si cell === null : affiche "N/A" en pointille (pas souscrit) avec clic
//  qui ouvre le picker pour souscrire + choisir un statut directement.
// ============================================================================

function StatutCell({
  cell,
  options,
  onPick,
}: {
  cell: IrObligationCell | null;
  options: IrStatusOption[];
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
    const POPOVER_HEIGHT = 220;
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
    setPos({
      left: clampedLeft,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
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
          "inline-block min-w-[90px] px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
          isSubscribed
            ? statutColorClass(cell!.statut_logique, null)
            : "bg-violet-50 dark:bg-violet-500/15 border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300"
        )}
      >
        {isSubscribed ? cell!.libelle ?? "À faire" : "N/A"}
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
            className="min-w-[220px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.04] overflow-hidden animate-slide-up-fade"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b dark:border-white/[0.06]">
              Statut
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
            className="min-w-[200px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.04] overflow-hidden animate-slide-up-fade"
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
//  NewClientIrForm
// ============================================================================

function NewClientIrForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [civilite, setCivilite] = useState<"M." | "Mme" | "Mlle" | "">("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!nom.trim()) {
      setError("Nom obligatoire");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createClientIr({
          civilite: (civilite || null) as "M." | "Mme" | "Mlle" | null,
          prenom: prenom || null,
          nom,
          email: email || null,
          telephone: telephone || null,
        });
        toastSuccess("Dossier IR cree");
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
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nouveau dossier IR</div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <select
          value={civilite}
          onChange={(e) => setCivilite(e.target.value as "M." | "Mme" | "Mlle" | "")}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        >
          <option value="">- Civ. -</option>
          <option value="M.">M.</option>
          <option value="Mme">Mme</option>
          <option value="Mlle">Mlle</option>
        </select>
        <input
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          placeholder="Prénom"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom *"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Téléphone"
          type="tel"
          inputMode="tel"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums"
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
          disabled={isPending || !nom.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Création…" : "Créer"}
        </button>
      </div>
    </div>
  );
}
