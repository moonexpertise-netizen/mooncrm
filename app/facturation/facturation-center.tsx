"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { setFacturationFromCentral } from "./actions";

export type FactSource = "caa" | "ir" | "ago" | "bilan" | "mission_exc";

export type FactItem = {
  /** Cle unique pour le rendu (prefixee par la source). */
  key: string;
  source: FactSource;
  /** ID utilisé par setFacturationFromCentral (obligation_id, mission_id ou "clientIrId|annee"). */
  rowId: string;
  clientName: string;
  /** Lien vers la page source pour ouvrir le contexte. */
  clientHref: string | null;
  /** Detail principal (ex. "CAA 2024", "Bilan 2025", "Transfert siège"). */
  detail: string;
  /** Sous-detail (statut original, date, etc.). */
  sousDetail: string | null;
  /** Montant indicatif si disponible (€). */
  montant: number | null;
  etat_facturation: "a_facturer" | "facturee" | "sans_facture" | null;
};

const SOURCE_LABEL: Record<FactSource, string> = {
  caa: "CAA",
  ir: "IR / IFI",
  ago: "AGO",
  bilan: "Bilan",
  mission_exc: "Mission exc.",
};

// Palette tags-source : on evite amber/sky/emerald/zinc reserves a la semantique
// metier (action / en cours / termine / inactif). Teal, indigo, rose, orange,
// fuchsia donnent 5 teintes distinctes sans collision avec les pastilles
// d'etat affichees sur la meme ligne.
const SOURCE_COLOR: Record<FactSource, string> = {
  caa: "bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30",
  ir: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30",
  ago: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
  bilan: "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
  mission_exc: "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-500/30",
};

const FACT_OPTIONS: Array<{
  key: "a_facturer" | "facturee" | "sans_facture";
  label: string;
  color: string;
}> = [
  { key: "a_facturer", label: "À facturer", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "facturee", label: "Facturée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
  { key: "sans_facture", label: "Sans facture", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
];

const ETAT_FILTERS: Array<{ key: "all" | "a_facturer" | "facturee" | "sans_facture"; label: string }> = [
  { key: "a_facturer", label: "À facturer" },
  { key: "facturee", label: "Facturées" },
  { key: "sans_facture", label: "Sans facture" },
  { key: "all", label: "Toutes" },
];

const SOURCE_FILTERS: Array<{ key: "all" | FactSource; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "caa", label: "CAA" },
  { key: "ir", label: "IR / IFI" },
  { key: "ago", label: "AGO" },
  { key: "bilan", label: "Bilan" },
  { key: "mission_exc", label: "Mission exc." },
];

function formatEUR(n: number | null): string {
  if (n === null) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " € HT";
}

export default function FacturationCenter({
  items,
  totalCount,
  filterEtat,
  filterSource,
}: {
  items: FactItem[];
  totalCount: number;
  filterEtat: "all" | "a_facturer" | "facturee" | "sans_facture";
  filterSource: "all" | FactSource;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localItems, setLocalItems] = useState(items);
  useEffect(() => setLocalItems(items), [items]);

  function onSetFact(item: FactItem, etat: FactItem["etat_facturation"]) {
    setLocalItems((prev) =>
      prev.map((it) => (it.key === item.key ? { ...it, etat_facturation: etat } : it))
    );
    startTransition(async () => {
      try {
        await setFacturationFromCentral(item.source, item.rowId, etat);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec sauvegarde facturation");
        router.refresh();
      }
    });
  }

  // KPI : compteurs par etat sur les items actuellement filtres.
  // "facturee" est l'etat terminal (pas de "payee" separe).
  const kpi = useMemo(() => {
    let aFacturer = 0;
    let facturee = 0;
    let sansFacture = 0;
    let totalAFacturer = 0;
    let totalFacturee = 0;
    for (const it of localItems) {
      const eff = it.etat_facturation ?? "a_facturer";
      if (eff === "a_facturer") {
        aFacturer++;
        if (it.montant) totalAFacturer += it.montant;
      } else if (eff === "facturee") {
        facturee++;
        if (it.montant) totalFacturee += it.montant;
      } else if (eff === "sans_facture") {
        sansFacture++;
      }
    }
    return { aFacturer, facturee, sansFacture, totalAFacturer, totalFacturee };
  }, [localItems]);

  function urlFor(etat: string, source: string) {
    const params = new URLSearchParams();
    if (etat !== "a_facturer") params.set("etat", etat);
    if (source !== "all") params.set("source", source);
    const q = params.toString();
    return q ? `/facturation?${q}` : "/facturation";
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="À facturer" value={String(kpi.aFacturer)} subtitle={kpi.totalAFacturer ? formatEUR(kpi.totalAFacturer) + " (estim.)" : "-"} accent="amber" />
        <Kpi label="Facturées" value={String(kpi.facturee)} subtitle={kpi.totalFacturee ? formatEUR(kpi.totalFacturee) + " (estim.)" : "-"} accent="emerald" />
        <Kpi label="Sans facture" value={String(kpi.sansFacture)} subtitle="-" accent="zinc" />
        <Kpi label="Total affiché" value={String(localItems.length)} subtitle={`sur ${totalCount} au total`} accent="zinc" />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterBar
          label="État"
          options={ETAT_FILTERS}
          value={filterEtat}
          buildUrl={(k) => urlFor(k, filterSource)}
        />
        <FilterBar
          label="Source"
          options={SOURCE_FILTERS}
          value={filterSource}
          buildUrl={(k) => urlFor(filterEtat, k)}
        />
      </div>

      {/* Tableau */}
      {localItems.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          Aucune ligne de facturation pour ces filtres.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm min-w-[800px]" aria-label="Facturation à émettre">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Source</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Client</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Détail</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[120px]">Montant HT</th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[140px]">État</th>
                <th scope="col" className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {localItems.map((it) => (
                <tr key={it.key} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-medium border", SOURCE_COLOR[it.source])}>
                      {SOURCE_LABEL[it.source]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{it.clientName}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-zinc-800 dark:text-zinc-200">{it.detail}</span>
                      {it.sousDetail && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{it.sousDetail}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm font-semibold">
                    {it.montant ? formatEUR(it.montant) : <span className="text-zinc-300 dark:text-zinc-600 italic">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <FactPicker value={it.etat_facturation} onChange={(v) => onSetFact(it, v)} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {it.clientHref && (
                      <Link href={it.clientHref} className="inline-flex items-center justify-center w-7 h-7 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label={`Ouvrir ${it.clientName}`} title="Ouvrir la page source">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        {localItems.length} ligne{localItems.length > 1 ? "s" : ""} affichée{localItems.length > 1 ? "s" : ""}
        {totalCount !== localItems.length && ` sur ${totalCount} au total`}.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent: "sky" | "emerald" | "amber" | "zinc";
}) {
  const colors: Record<typeof accent, string> = {
    sky: "text-sky-700 dark:text-sky-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-3 shadow-card">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums mt-1", colors[accent])}>{value}</div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{subtitle}</div>
    </div>
  );
}

function FilterBar({
  label,
  options,
  value,
  buildUrl,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  value: string;
  buildUrl: (k: string) => string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{label} :</span>
      <nav className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Link
              key={o.key}
              href={buildUrl(o.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs transition-all",
                active
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
              )}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ============================================================================
//  FactPicker : 4 etats + reset, en portal pour echapper au clipping
// ============================================================================

function FactPicker({
  value,
  onChange,
}: {
  value: FactItem["etat_facturation"];
  onChange: (v: FactItem["etat_facturation"]) => void;
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

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 whitespace-nowrap min-w-[100px] justify-center",
          current ? current.color : FACT_OPTIONS[0].color
        )}
      >
        {current ? current.label : "À facturer"}
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
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                  {o.label}
                </span>
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
