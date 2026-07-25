"use client";

import { useMemo, useState } from "react";
import { FileType2, Download, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan } from "@/app/_components/permissions-context";
import { toastError, toastSuccess } from "@/lib/toast-helpers";

export type DocClient = {
  id: string;
  denomination: string;
  forme: string | null;
  pipeline_statut: string | null;
  /** Champs cœur manquants pour la LDM (avertissement, non bloquant). */
  missing: string[];
};

type Template = "presentation" | "bnc" | "sociale";
const TEMPLATES: { value: Template; label: string }[] = [
  { value: "presentation", label: "Présentation" },
  { value: "bnc", label: "BNC" },
  { value: "sociale", label: "PAIE" },
];

export default function BulkDocuments({ rows }: { rows: DocClient[] }) {
  const canEdit = useCan("edit_clients");
  const [template, setTemplate] = useState<Template>("presentation");
  const [search, setSearch] = useState("");
  const [signedOnly, setSignedOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (signedOnly && r.pipeline_statut !== "8 - LDM signée") return false;
      if (q && !r.denomination.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, signedOnly]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => n.delete(r.id));
      else filtered.forEach((r) => n.add(r.id));
      return n;
    });
  }

  async function generate() {
    const ids = [...selected];
    if (ids.length === 0) return toastError("Sélectionne au moins un dossier.");
    setBusy(true);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, clientIds: ids }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m?.[1] ?? "documents.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastSuccess(`${ids.length} document${ids.length > 1 ? "s" : ""} généré${ids.length > 1 ? "s" : ""}`);
    } catch (e) {
      toastError(e, "Echec de la génération");
    } finally {
      setBusy(false);
    }
  }

  const selCount = selected.size;

  return (
    <div className="space-y-4">
      {/* Type de document */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Type :</span>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
          {TEMPLATES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTemplate(t.value)}
              className={cn(
                "px-3 py-1 rounded-lg text-sm transition-colors",
                template === t.value
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par dossier…"
          className="h-9 w-full sm:w-64 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
          <input type="checkbox" checked={signedOnly} onChange={(e) => setSignedOnly(e.target.checked)} className="accent-[hsl(var(--gold))]" />
          LDM signée uniquement
        </label>
        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} dossier{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-white/[0.06]">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="accent-[hsl(var(--gold))]" aria-label="Tout sélectionner" />
              </th>
              <th className="px-3 py-2.5 font-medium">Dossier</th>
              <th className="px-3 py-2.5 font-medium">Forme</th>
              <th className="px-3 py-2.5 font-medium">Complétude</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => toggle(r.id)}
                className={cn(
                  "border-b border-zinc-50 dark:border-white/[0.04] last:border-0 cursor-pointer transition-colors",
                  selected.has(r.id) ? "bg-[hsl(var(--gold))]/[0.06]" : "hover:bg-zinc-50/60 dark:hover:bg-white/[0.02]"
                )}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-[hsl(var(--gold))]" />
                </td>
                <td className="px-3 py-2.5 font-medium">{r.denomination}</td>
                <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">{r.forme ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {r.missing.length === 0 ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Complet</span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"
                      title={`Manque : ${r.missing.join(", ")}`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {r.missing.length} champ{r.missing.length > 1 ? "s" : ""} manquant{r.missing.length > 1 ? "s" : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-400">Aucun dossier.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'action */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white/95 dark:bg-[hsl(var(--card))]/95 backdrop-blur px-4 py-3 shadow-card">
        <span className="text-sm text-zinc-600 dark:text-zinc-300">
          {selCount === 0 ? "Aucun dossier sélectionné" : `${selCount} dossier${selCount > 1 ? "s" : ""} sélectionné${selCount > 1 ? "s" : ""}`}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={!canEdit || busy || selCount === 0}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            canEdit && !busy && selCount > 0
              ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
              : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? "Génération…" : `Générer le ZIP (${selCount})`}
        </button>
      </div>

      <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
        <FileType2 className="h-3 w-3" />
        Les documents sortent en brouillon (.docx). Les champs manquants apparaîtront vides — complète les dossiers signalés avant.
      </p>
    </div>
  );
}
