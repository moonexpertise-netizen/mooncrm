"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useConfirm } from "@/app/_components/confirm-modal";
import {
  createTvaTag,
  deleteTvaTag,
  renameTvaTag,
  setTvaTagActif,
  setTvaTagColor,
  type TvaTagColor,
} from "./actions";

export type TvaTagRow = {
  id: string;
  label: string;
  color: string;
  ordre: number;
  actif: boolean;
  clientCount: number;
};

// 8 couleurs : alignees avec StatusFilterChip (cf. status-filter-chip.tsx)
const COLOR_PALETTE: Array<{ key: TvaTagColor; bg: string; ring: string }> = [
  { key: "zinc", bg: "bg-zinc-400 dark:bg-zinc-500", ring: "ring-zinc-300 dark:ring-zinc-600" },
  { key: "sky", bg: "bg-sky-400 dark:bg-sky-500", ring: "ring-sky-300 dark:ring-sky-600" },
  { key: "emerald", bg: "bg-emerald-400 dark:bg-emerald-500", ring: "ring-emerald-300 dark:ring-emerald-600" },
  { key: "amber", bg: "bg-amber-400 dark:bg-amber-500", ring: "ring-amber-300 dark:ring-amber-600" },
  { key: "violet", bg: "bg-violet-400 dark:bg-violet-500", ring: "ring-violet-300 dark:ring-violet-600" },
  { key: "rose", bg: "bg-rose-400 dark:bg-rose-500", ring: "ring-rose-300 dark:ring-rose-600" },
  { key: "teal", bg: "bg-teal-400 dark:bg-teal-500", ring: "ring-teal-300 dark:ring-teal-600" },
  { key: "indigo", bg: "bg-indigo-400 dark:bg-indigo-500", ring: "ring-indigo-300 dark:ring-indigo-600" },
];

export default function TvaTagsManager({ initialRows }: { initialRows: TvaTagRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<TvaTagColor>("zinc");
  const [creating, setCreating] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  function onCreate() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setCreating(true);
    startTransition(async () => {
      try {
        const created = await createTvaTag(trimmed, newColor);
        setRows((prev) => [...prev, { ...created, clientCount: 0 }]);
        setNewLabel("");
        setNewColor("zinc");
        toastSuccess(`Étiquette « ${created.label} » créée`);
      } catch (e) {
        toastError(e, "Échec création");
      } finally {
        setCreating(false);
      }
    });
  }

  function onRename(id: string, label: string) {
    const current = rows.find((r) => r.id === id);
    if (!current || current.label === label) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label: current.label } : r))); // revert
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label: trimmed } : r)));
    startTransition(async () => {
      try {
        await renameTvaTag(id, trimmed);
      } catch (e) {
        toastError(e, "Échec renommage");
        router.refresh();
      }
    });
  }

  function onSetColor(id: string, color: TvaTagColor) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, color } : r)));
    startTransition(async () => {
      try {
        await setTvaTagColor(id, color);
      } catch (e) {
        toastError(e, "Échec couleur");
        router.refresh();
      }
    });
  }

  function onToggleActif(id: string, actif: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, actif } : r)));
    startTransition(async () => {
      try {
        await setTvaTagActif(id, actif);
      } catch (e) {
        toastError(e, "Échec activation");
        router.refresh();
      }
    });
  }

  async function onDelete(row: TvaTagRow) {
    const message = row.clientCount > 0
      ? `« ${row.label} » est utilisée par ${row.clientCount} dossier${row.clientCount > 1 ? "s" : ""}. La supprimer enlèvera l'étiquette de ces dossiers (sans les supprimer eux-mêmes). Confirmer ?`
      : `Supprimer définitivement l'étiquette « ${row.label} » ?`;
    const ok = await confirm({
      title: "Supprimer l'étiquette",
      description: message,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    startTransition(async () => {
      try {
        const { detached } = await deleteTvaTag(row.id);
        toastSuccess(
          detached > 0
            ? `Étiquette supprimée · ${detached} dossier${detached > 1 ? "s" : ""} détaché${detached > 1 ? "s" : ""}`
            : "Étiquette supprimée"
        );
      } catch (e) {
        toastError(e, "Échec suppression");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {ConfirmDialog}

      {/* Carte creation */}
      <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-3 shadow-card">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">
          Nouvelle étiquette
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) onCreate();
            }}
            placeholder="Ex. TVA Express, TVA + longue, Saisonnier…"
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button
            type="button"
            onClick={onCreate}
            disabled={!newLabel.trim() || creating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Créer
          </button>
        </div>
      </div>

      {/* Liste des etiquettes existantes */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Aucune étiquette pour le moment. Crée la première ci-dessus.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-hidden shadow-card">
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {rows.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  !r.actif && "opacity-50"
                )}
              >
                {/* Couleur (picker au clic) */}
                <ColorPicker value={r.color as TvaTagColor} onChange={(c) => onSetColor(r.id, c)} />

                {/* Label inline editable */}
                <input
                  type="text"
                  defaultValue={r.label}
                  onBlur={(e) => onRename(r.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = r.label;
                      e.currentTarget.blur();
                    }
                  }}
                  className="flex-1 min-w-0 px-2 py-1 rounded text-sm bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.08] focus:outline-none focus:border-zinc-300 dark:focus:border-white/[0.16] focus:bg-white dark:focus:bg-white/[0.04] transition-colors"
                />

                {/* Compteur clients */}
                <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0 px-2">
                  {r.clientCount} dossier{r.clientCount > 1 ? "s" : ""}
                </span>

                {/* Toggle actif/inactif */}
                <button
                  type="button"
                  onClick={() => onToggleActif(r.id, !r.actif)}
                  className={cn(
                    "px-2 py-1 rounded text-[11px] font-medium border transition-colors",
                    r.actif
                      ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25"
                      : "border-zinc-200 dark:border-white/[0.10] bg-zinc-50 dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  )}
                  title={r.actif ? "Étiquette active" : "Étiquette désactivée (cachée du tracker)"}
                >
                  {r.actif ? (
                    <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Active</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><X className="h-3 w-3" /> Inactive</span>
                  )}
                </button>

                {/* Supprimer */}
                <button
                  type="button"
                  onClick={() => onDelete(r)}
                  className="p-1.5 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                  aria-label={`Supprimer ${r.label}`}
                  title="Supprimer cette étiquette"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        Les étiquettes désactivées restent en DB mais ne s&apos;affichent plus dans le tracker TVA mensuelle. Idéal pour archiver sans perdre l&apos;historique.
      </p>
    </div>
  );
}

// ============================================================================
//  ColorPicker : 8 swatches inline
// ============================================================================

function ColorPicker({
  value,
  onChange,
}: {
  value: TvaTagColor;
  onChange: (c: TvaTagColor) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-md border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02]">
      {COLOR_PALETTE.map((c) => {
        const active = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-label={`Couleur ${c.key}`}
            title={c.key}
            className={cn(
              "w-4 h-4 rounded-full transition-all",
              c.bg,
              active ? cn("ring-2 ring-offset-1 dark:ring-offset-zinc-900 scale-110", c.ring) : "opacity-70 hover:opacity-100"
            )}
          />
        );
      })}
    </div>
  );
}
