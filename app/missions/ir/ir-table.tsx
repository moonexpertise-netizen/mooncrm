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

export type IrRow = {
  id: string;
  slug: string;
  civilite: "M." | "Mme" | "Mlle" | null;
  prenom: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  ldm_statut: string;
  ir: { libelle: string | null; statut_logique: string } | null;
  ifi: { libelle: string | null; statut_logique: string } | null;
};

// Mini-pipeline LDM (commun a IR et CAA — sera deplace dans une lib si besoin)
const LDM_VALUES: Array<{ key: string; label: string; color: string }> = [
  { key: "a_preparer", label: "À préparer", color: "bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/[0.12]" },
  { key: "propale_acceptee", label: "Propale acceptée", color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30" },
  { key: "ldm_envoyee", label: "LDM envoyée", color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30" },
  { key: "ldm_signee", label: "LDM signée", color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30" },
];

export default function IrTable({
  rows,
  annee,
  years,
  statusOptions,
}: {
  rows: IrRow[];
  annee: number;
  years: number[];
  statusOptions: Record<string, IrStatusOption[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);
  const { confirm, ConfirmDialog } = useConfirm();

  function changeYear(y: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(y));
    router.push(url.pathname + url.search);
  }

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

  function onSetStatut(clientIrId: string, type: IrType, libelle: string | null) {
    // Optimistic
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const opts = statusOptions[`${type}_ANNEE`] ?? [];
        const sl = opts.find((o) => o.libelle === libelle)?.statut_logique ?? "A_FAIRE";
        const slot = { libelle, statut_logique: sl };
        return type === "IR" ? { ...r, ir: slot } : { ...r, ifi: slot };
      })
    );
    startTransition(async () => {
      try {
        await setIrObligationStatut(clientIrId, annee, type, libelle);
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

  return (
    <div className={cn("space-y-3", isPending && "opacity-95")}>
      {ConfirmDialog}

      {/* Toolbar : selecteur d'annee + bouton ajouter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 px-2">Exercice</span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => changeYear(y)}
              className={cn(
                "px-3 py-1 rounded-lg text-sm tabular-nums transition-all border",
                y === annee
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border-transparent"
              )}
            >
              {y}
            </button>
          ))}
        </div>

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

      {/* Formulaire creation inline */}
      {adding && (
        <NewClientIrForm onCancel={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} />
      )}

      {/* Table */}
      {localRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          Aucun dossier IR pour l&apos;instant. Clique sur « Nouveau dossier IR » pour commencer.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm" aria-label="Dossiers IR">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Nom</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Email / Tél</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Statut LDM</th>
                <th scope="col" className="px-4 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400">IR {annee}</th>
                <th scope="col" className="px-4 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400">IFI {annee}</th>
                <th scope="col" className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {localRows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {[r.civilite, r.prenom, r.nom].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {r.email && <div className="truncate max-w-[200px]">{r.email}</div>}
                    {r.telephone && <div className="tabular-nums">{r.telephone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <LdmPicker value={r.ldm_statut} onChange={(v) => onSetLdm(r.id, v)} />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <StatutPicker
                      currentLibelle={r.ir?.libelle ?? null}
                      currentLogique={(r.ir?.statut_logique as StatutLogique) ?? null}
                      options={statusOptions["IR_ANNEE"] ?? []}
                      onPick={(libelle) => onSetStatut(r.id, "IR", libelle)}
                    />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <StatutPicker
                      currentLibelle={r.ifi?.libelle ?? null}
                      currentLogique={(r.ifi?.statut_logique as StatutLogique) ?? null}
                      options={statusOptions["IFI_ANNEE"] ?? []}
                      onPick={(libelle) => onSetStatut(r.id, "IFI", libelle)}
                    />
                  </td>
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
        {localRows.length} dossier{localRows.length > 1 ? "s" : ""} IR — exercice {annee}.
      </p>
    </div>
  );
}

// ============================================================================
//  LdmPicker — mini-popover pour le statut LDM (cycle dropdown simple)
// ============================================================================

function LdmPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LDM_VALUES.find((v) => v.key === value) ?? LDM_VALUES[0];

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative inline-block">
      <button
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
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 min-w-[180px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-xl overflow-hidden">
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
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  StatutPicker — picker style Notion pour IR/IFI/CAA, portaillé
// ============================================================================

function StatutPicker({
  currentLibelle,
  currentLogique,
  options,
  onPick,
}: {
  currentLibelle: string | null;
  currentLogique: StatutLogique | null;
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

  return (
    <div ref={ref} className="inline-block">
      <button
        data-statut-btn="1"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-block min-w-[80px] px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
          currentLibelle
            ? statutColorClass(currentLogique ?? "A_FAIRE", null)
            : "bg-zinc-50 dark:bg-white/[0.03] border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-400 dark:text-zinc-500"
        )}
      >
        {currentLibelle ?? "—"}
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
            className="bg-white dark:bg-[hsl(var(--surface-elevated))] border dark:border-white/[0.10] rounded-lg shadow-xl min-w-[200px] overflow-hidden animate-slide-up-fade"
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
                    currentLibelle === o.libelle && "bg-zinc-50 dark:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", statutColorClass(o.statut_logique, o.color))}>
                    {o.libelle}
                  </span>
                  {currentLibelle === o.libelle && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
            {currentLibelle && (
              <div className="border-t dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Réinitialiser
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

// Note : Link import garde pour evolution future (fiche detail)
void Link;
