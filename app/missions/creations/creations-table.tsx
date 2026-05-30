"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { setCreationStatut, type CreationStatut } from "./actions";

export type { CreationStatut };

export type CreationRow = {
  id: string;
  slug: string;
  denomination: string;
  forme: string | null;
  pipeline_statut: string | null;
  mois_signature: string | null;
  debut_obligations: string | null;
  dirigeant: string | null;
  creation_statut: CreationStatut | null;
};

// ============================================================================
// Constantes : libelles et palette par statut
// ============================================================================

const STATUT_DEF: Array<{
  key: CreationStatut | "non_demarre";
  label: string;
  group: "a_faire" | "en_cours" | "termine";
  color: string;
}> = [
  {
    key: "non_demarre",
    label: "—",
    group: "a_faire",
    color: "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]",
  },
  {
    key: "a_traiter",
    label: "À traiter",
    group: "a_faire",
    color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30",
  },
  {
    key: "depot_capital",
    label: "Dépôt de capital",
    group: "en_cours",
    color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "inpi_en_cours",
    label: "INPI en cours",
    group: "en_cours",
    color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "inpi_termine",
    label: "INPI terminé",
    group: "en_cours",
    color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "actee_kbis_recu",
    label: "Actée · KBIS reçu",
    group: "termine",
    color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30",
  },
];

function defFor(statut: CreationStatut | null): (typeof STATUT_DEF)[number] {
  if (!statut) return STATUT_DEF[0];
  return STATUT_DEF.find((s) => s.key === statut) ?? STATUT_DEF[0];
}

type FilterKey = "all" | "a_faire" | "en_cours" | "termine";

// ============================================================================
// Composant principal
// ============================================================================

export default function CreationsTable({
  rows,
  initialFilter,
}: {
  rows: CreationRow[];
  initialFilter: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  const [filter, setFilter] = useState<FilterKey>(
    (["all", "a_faire", "en_cours", "termine"] as const).includes(initialFilter as FilterKey)
      ? (initialFilter as FilterKey)
      : "all"
  );

  useEffect(() => setLocalRows(rows), [rows]);

  // Recap par groupe
  const recap = useMemo(() => {
    const r = { a_faire: 0, en_cours: 0, termine: 0, total: localRows.length };
    for (const row of localRows) {
      const d = defFor(row.creation_statut);
      r[d.group]++;
    }
    return r;
  }, [localRows]);

  const filtered = useMemo(() => {
    if (filter === "all") return localRows;
    return localRows.filter((r) => defFor(r.creation_statut).group === filter);
  }, [localRows, filter]);

  function onSetStatut(clientId: string, statut: CreationStatut | null) {
    setLocalRows((prev) =>
      prev.map((r) => (r.id === clientId ? { ...r, creation_statut: statut } : r))
    );
    startTransition(async () => {
      try {
        await setCreationStatut(clientId, statut);
      } catch (e) {
        toastError(e, "Echec sauvegarde statut création");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="À traiter" value={recap.a_faire} accent="amber" />
        <Kpi label="En cours" value={recap.en_cours} accent="sky" />
        <Kpi label="Terminés" value={recap.termine} accent="emerald" />
        <Kpi label="Total dossiers" value={recap.total} accent="zinc" />
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip label="Tous" active={filter === "all"} onClick={() => setFilter("all")} count={recap.total} />
        <FilterChip label="À traiter" active={filter === "a_faire"} onClick={() => setFilter("a_faire")} count={recap.a_faire} accent="amber" />
        <FilterChip label="En cours" active={filter === "en_cours"} onClick={() => setFilter("en_cours")} count={recap.en_cours} accent="sky" />
        <FilterChip label="Terminés" active={filter === "termine"} onClick={() => setFilter("termine")} count={recap.termine} accent="emerald" />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {localRows.length === 0
            ? "Aucun dossier en création. Crée un nouveau dossier avec origine « 1 - Création » pour le voir apparaître ici."
            : "Aucun dossier ne correspond au filtre actuel."}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]" aria-label="Dossiers en création">
            <thead className="bg-zinc-50/50 dark:bg-white/[0.02] border-b border-zinc-200/70 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Société</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[80px]">Forme</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Dirigeant</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[200px]">Statut création</th>
                <th scope="col" className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <Link href={`/clients/${r.slug}`} className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                      {r.denomination}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 text-[13px]">
                    {r.forme || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300 text-[13px]">
                    {r.dirigeant || <span className="text-zinc-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatutPicker
                      value={r.creation_statut}
                      onChange={(v) => onSetStatut(r.id, v)}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <Link
                      href={`/clients/${r.slug}`}
                      className="inline-flex items-center justify-center p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
                      aria-label={`Ouvrir la fiche ${r.denomination}`}
                      title="Ouvrir la fiche"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        {filtered.length} dossier{filtered.length > 1 ? "s" : ""}
        {localRows.length !== filtered.length && ` sur ${localRows.length} en cours de création`}
      </p>
    </div>
  );
}

// ============================================================================
// Composants internes
// ============================================================================

function Kpi({ label, value, accent }: { label: string; value: number; accent: "amber" | "sky" | "emerald" | "zinc" }) {
  const accents: Record<typeof accent, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    sky: "text-sky-700 dark:text-sky-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums tracking-tight mt-0.5", accents[accent])}>{value}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
  accent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
  accent?: "amber" | "sky" | "emerald";
}) {
  const accents: Record<NonNullable<typeof accent>, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    sky: "text-sky-700 dark:text-sky-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors border",
        active
          ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-50"
          : "bg-white dark:bg-white/[0.02] border-zinc-200/70 dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/[0.12]"
      )}
    >
      <span className={cn(!active && accent && accents[accent])}>{label}</span>
      <span className={cn("tabular-nums text-[10px]", active ? "text-white/70 dark:text-zinc-900/70" : "text-zinc-400 dark:text-zinc-500")}>
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// StatutPicker : Notion-like
// ============================================================================

function StatutPicker({
  value,
  onChange,
}: {
  value: CreationStatut | null;
  onChange: (v: CreationStatut | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = defFor(value);

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = 320;
    const POPOVER_WIDTH = 240;
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

  // Grouper par catégorie pour le popover
  const groups: Array<{ key: "a_faire" | "en_cours" | "termine"; label: string; items: typeof STATUT_DEF }> = [
    { key: "a_faire", label: "À faire", items: STATUT_DEF.filter((s) => s.group === "a_faire") },
    { key: "en_cours", label: "En cours", items: STATUT_DEF.filter((s) => s.group === "en_cours") },
    { key: "termine", label: "Terminé", items: STATUT_DEF.filter((s) => s.group === "termine") },
  ];

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 whitespace-nowrap",
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
            className="min-w-[240px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {groups.map((g, gi) => (
              <div key={g.key}>
                <div className={cn(
                  "px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium",
                  gi > 0 && "border-t border-zinc-100 dark:border-white/[0.06] mt-1"
                )}>
                  {g.label}
                </div>
                {g.items.map((s) => {
                  const isActive = (value === null && s.key === "non_demarre") || value === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        onChange(s.key === "non_demarre" ? null : (s.key as CreationStatut));
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                        isActive && "bg-zinc-50 dark:bg-white/[0.04]"
                      )}
                    >
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", s.color)}>
                        {s.label}
                      </span>
                      {isActive && <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
