"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { reviseHonoraires } from "./actions";

/**
 * Modale "Ajuster les honoraires" : SEUL point d'entrée pour modifier les
 * montants d'honoraires récurrents (motif obligatoire, journalisé dans
 * l'historique). Sur la fiche, les montants sont affichés en lecture seule ;
 * ce bouton ouvre la modale.
 */

type Line = { field: string; label: string; value: number; suffix: string };

const MOTIF_CHIPS = [
  "Augmentation annuelle",
  "Nouveau service",
  "Remise commerciale",
  "Ajustement",
  "Correction erreur",
];

export default function AdjustHonorairesModal({
  clientId,
  compta,
  typeBilan,
  forfaitBilan,
  typeJur,
  honosJur,
  tdbPeriode,
  tdbHonosPeriode,
  ossPeriode,
  ossHonosTrimestre,
  compact = false,
}: {
  clientId: string;
  compact?: boolean;
  compta: number;
  typeBilan: "Facturés" | "Inclus" | null;
  forfaitBilan: number;
  typeJur: "Facturés" | "Inclus" | "Non souscrit" | null;
  honosJur: number;
  tdbPeriode: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
  tdbHonosPeriode: number;
  ossPeriode: "Trimestriel" | "Non souscrit" | null;
  ossHonosTrimestre: number;
}) {
  const canEdit = useCan("edit_honoraires");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Lignes applicables selon les types/périodicités souscrits.
  const lines: Line[] = useMemo(() => {
    const l: Line[] = [
      { field: "honoraires_compta", label: "Forfait comptable", value: compta, suffix: "/mois" },
    ];
    if (typeBilan === "Facturés") l.push({ field: "forfait_bilan", label: "Forfait bilan", value: forfaitBilan, suffix: "/an" });
    if (typeJur === "Facturés") l.push({ field: "honoraires_jur", label: "Forfait juridique", value: honosJur, suffix: "/an" });
    if (tdbPeriode === "Mensuel" || tdbPeriode === "Trimestriel") {
      l.push({ field: "tdb_honos_periode", label: "Forfait pilotage", value: tdbHonosPeriode, suffix: tdbPeriode === "Mensuel" ? "/mois" : "/trim" });
    }
    if (ossPeriode === "Trimestriel") l.push({ field: "oss_honos_trimestre", label: "Guichet OSS", value: ossHonosTrimestre, suffix: "/trim" });
    return l;
  }, [compta, typeBilan, forfaitBilan, typeJur, honosJur, tdbPeriode, tdbHonosPeriode, ossPeriode, ossHonosTrimestre]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    // Réinitialise les brouillons aux valeurs courantes.
    const init: Record<string, string> = {};
    for (const ln of lines) init[ln.field] = String(ln.value);
    setDrafts(init);
    setMotif("");
    setError(null);
    setOpen(true);
  }

  // Patch = uniquement les montants réellement changés.
  const patch = useMemo(() => {
    const p: Record<string, number> = {};
    for (const ln of lines) {
      const raw = drafts[ln.field];
      if (raw == null) continue;
      const n = parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) continue;
      if (Math.round(n * 100) / 100 !== ln.value) p[ln.field] = Math.round(n * 100) / 100;
    }
    return p;
  }, [drafts, lines]);

  const nbChanges = Object.keys(patch).length;
  const canSave = nbChanges > 0 && motif.trim().length > 0;

  function save() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      try {
        await reviseHonoraires(clientId, patch, motif.trim());
        toastSuccess(`Honoraires révisés (${nbChanges} champ${nbChanges > 1 ? "s" : ""})`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de la révision");
      }
    });
  }

  if (!canEdit) return null;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={openModal}
          title="Ajuster les honoraires"
          aria-label="Ajuster les honoraires"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.16] transition shadow-sm"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Ajuster les honoraires
        </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-zinc-900/50 dark:bg-[hsl(226_85%_3%_/_0.6)] backdrop-blur-md" onClick={() => setOpen(false)} aria-hidden />
            <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ajuster les honoraires</h3>
                <button type="button" onClick={() => setOpen(false)} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label="Fermer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {lines.map((ln) => (
                  <div key={ln.field} className="grid grid-cols-[1fr_140px] gap-2 items-center">
                    <label className="text-sm text-zinc-700 dark:text-zinc-300">
                      {ln.label} <span className="text-[11px] text-muted-foreground">{ln.suffix}</span>
                    </label>
                    <div className="flex items-center gap-1 px-2 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04]">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drafts[ln.field] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [ln.field]: e.target.value }))}
                        className="w-full px-1 py-1.5 text-sm tabular-nums bg-transparent focus:outline-none text-zinc-900 dark:text-zinc-100"
                      />
                      <span className="text-[11px] text-zinc-400">€</span>
                    </div>
                  </div>
                ))}

                <div className="pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                  <label className="text-xs text-muted-foreground">Motif de la révision (obligatoire)</label>
                  <div className="flex flex-wrap gap-1 mt-1.5 mb-2">
                    {MOTIF_CHIPS.map((c) => (
                      <button key={c} type="button" onClick={() => setMotif(c)} className={cn("px-2 py-0.5 rounded-full text-[11px] border transition-colors", motif === c ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/40 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]" : "bg-zinc-50 dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08]")}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    rows={2}
                    placeholder="Ex. Augmentation annuelle +5 %, ajout du pilotage…"
                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>

                {error && <div className="text-xs text-rose-600 dark:text-rose-300">{error}</div>}
              </div>

              <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {nbChanges === 0 ? "Aucun changement" : `${nbChanges} montant${nbChanges > 1 ? "s" : ""} modifié${nbChanges > 1 ? "s" : ""}`}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
                    Annuler
                  </button>
                  <button type="button" onClick={save} disabled={!canSave} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors", canSave ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white" : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed")}>
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/** Petit helper d'affichage lecture seule (réutilisé par la fiche). */
export function ReadonlyEuro({ value }: { value: number }) {
  return <span className="tabular-nums">{value > 0 ? fmtEuro(value) : "0 €"}</span>;
}
