"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Lock, Unlock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { verrouillerPlanHonoraires, ouvrirNouveauPlanHonoraires } from "./actions";

/**
 * Verrouillage du plan d'honoraires, en UN geste.
 *
 *  - Déverrouillé : tous les montants sont saisissables librement sur la
 *    fiche. Bouton "Verrouiller le plan d'honoraires" pour figer l'ensemble.
 *  - Verrouillé : montants en lecture seule. "Nouveau plan d'honoraires"
 *    demande UNE justification, puis rouvre TOUS les montants d'un coup.
 *
 * On ne demande donc jamais de motif champ par champ : la justification
 * porte sur le plan, pas sur chaque ligne.
 */

const MOTIF_CHIPS = [
  "Augmentation annuelle",
  "Nouveau service",
  "Remise commerciale",
  "Renégociation",
  "Correction erreur",
];

export default function PlanHonorairesLock({
  clientId,
  verrouille,
  verrouilleAt,
}: {
  clientId: string;
  verrouille: boolean;
  verrouilleAt: string | null;
}) {
  const canEdit = useCan("edit_honoraires");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  function lock() {
    startTransition(async () => {
      try {
        await verrouillerPlanHonoraires(clientId);
        toastSuccess("Plan d'honoraires verrouillé");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec du verrouillage");
      }
    });
  }

  function unlock() {
    if (!motif.trim()) {
      setError("Indique un motif pour ouvrir un nouveau plan.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await ouvrirNouveauPlanHonoraires(clientId, motif.trim());
        toastSuccess("Nouveau plan ouvert, les montants sont modifiables");
        setOpen(false);
        setMotif("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de l'ouverture du plan");
      }
    });
  }

  if (!verrouille) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/[0.06] px-3 py-2">
        <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
          Saisie libre : renseigne tous les montants, puis verrouille le plan.
        </span>
        <button
          type="button"
          onClick={lock}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50"
        >
          <Lock className="h-3.5 w-3.5" />
          {pending ? "…" : "Verrouiller le plan d'honoraires"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <Lock className="h-3.5 w-3.5" />
          Plan verrouillé
          {verrouilleAt && <span className="text-zinc-400">· {fmtDate(verrouilleAt)}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setMotif("");
            setError(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors shadow-sm"
        >
          <Unlock className="h-3.5 w-3.5" />
          Nouveau plan d&apos;honoraires
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-zinc-900/50 dark:bg-[hsl(226_85%_3%_/_0.6)] backdrop-blur-md"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Nouveau plan d&apos;honoraires
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  Tous les montants redeviennent modifiables. Indique la raison
                  de cette révision, elle sera enregistrée dans l&apos;historique.
                </p>
                <div className="flex flex-wrap gap-1">
                  {MOTIF_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMotif(c)}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] border transition-colors",
                        motif === c
                          ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/40 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]"
                          : "bg-zinc-50 dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Ex. Augmentation annuelle +5 %, ajout du pilotage…"
                  className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
                {error && <div className="text-xs text-rose-600 dark:text-rose-300">{error}</div>}
              </div>

              <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={unlock}
                  disabled={pending || !motif.trim()}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    motif.trim() && !pending
                      ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
                      : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                  )}
                >
                  Ouvrir le plan
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
