"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, FileText, Check, Plus, Trash2 } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { useCan } from "@/app/_components/permissions-context";
import { toastError } from "@/lib/toast-helpers";
import { createApport, setApportRegle, deleteApport, type ApportMode } from "@/app/apports/actions";
import { Card } from "./_components";

export type ApportRow = {
  id: string;
  apporteur: string;
  montant: number;
  mode: ApportMode;
  regle: boolean;
  regle_at: string | null;
  note: string | null;
};

/**
 * Carte "Apports d'affaires" de la fiche client : commissions dues à un
 * apporteur pour ce dossier. Un dossier peut en avoir plusieurs. Réservée au
 * niveau finance (useCan view_finance). Mise en évidence quand le dossier est
 * signé mais qu'aucun apport n'est encore renseigné.
 */
export default function ApportsCard({
  clientId,
  apports,
  apporteurs,
  signed,
}: {
  clientId: string;
  apports: ApportRow[];
  apporteurs: string[];
  /** Dossier en pipeline "LDM signée" : on invite à renseigner un apport. */
  signed: boolean;
}) {
  const canView = useCan("view_finance");
  const canEdit = useCan("edit_facturation");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [apporteur, setApporteur] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState<ApportMode>("facture");

  if (!canView) return null;

  function refresh() {
    router.refresh();
  }

  function add() {
    const m = parseFloat(montant.replace(",", "."));
    if (!apporteur.trim()) return toastError("Nom de l'apporteur obligatoire.");
    if (!Number.isFinite(m) || m < 0) return toastError("Montant invalide.");
    startTransition(async () => {
      try {
        await createApport({ clientId, apporteur: apporteur.trim(), montant: m, mode });
        setAdding(false);
        setApporteur("");
        setMontant("");
        setMode("facture");
        refresh();
      } catch (e) {
        toastError(e, "Echec de l'ajout de l'apport");
      }
    });
  }

  function toggle(id: string, regle: boolean) {
    startTransition(async () => {
      try {
        await setApportRegle(id, regle);
        refresh();
      } catch (e) {
        toastError(e, "Echec de la mise à jour");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteApport(id);
        refresh();
      } catch (e) {
        toastError(e, "Echec de la suppression");
      }
    });
  }

  const inputCls =
    "px-2 py-1.5 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";

  return (
    <Card title="Apports d'affaires">
      {apports.length === 0 && !adding && (
        <div
          className={cn(
            "text-xs px-2 py-1.5 rounded-md",
            signed
              ? "bg-[hsl(var(--gold))]/[0.08] text-zinc-600 dark:text-zinc-300 border border-[hsl(var(--gold))]/30"
              : "text-zinc-400"
          )}
        >
          {signed
            ? "Dossier signé : un apporteur d'affaires est-il à rémunérer ?"
            : "Aucun apport d'affaires."}
        </div>
      )}

      {apports.length > 0 && (
        <div className="space-y-1.5">
          {apports.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 py-1.5 border-b border-zinc-100 dark:border-white/[0.06] last:border-0"
            >
              <span
                title={a.mode === "facture" ? "Facture" : "Carte cadeau perso"}
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded shrink-0",
                  a.mode === "facture"
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
                    : "bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300"
                )}
              >
                {a.mode === "facture" ? <FileText className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
              </span>
              <span className="text-sm font-medium truncate flex-1">{a.apporteur}</span>
              <span className="text-sm tabular-nums">{fmtEuro(a.montant)}</span>
              {a.regle ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/25">
                  Réglé
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200 dark:border-amber-500/25">
                  À régler
                </span>
              )}
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => toggle(a.id, !a.regle)}
                    title={a.regle ? "Repasser à régler" : "Marquer réglé"}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    title="Supprimer"
                    className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-2">
          {adding ? (
            <div className="space-y-2">
              <input
                list="apporteurs-list"
                value={apporteur}
                onChange={(e) => setApporteur(e.target.value)}
                placeholder="Nom de l'apporteur"
                className={cn(inputCls, "w-full")}
                autoFocus
              />
              <datalist id="apporteurs-list">
                {apporteurs.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    inputMode="decimal"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="Montant"
                    className={cn(inputCls, "w-full pr-6 tabular-nums")}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">€</span>
                </div>
                <div className="flex gap-1">
                  {(["facture", "carte_cadeau"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "px-2 py-1.5 rounded-md text-xs border transition inline-flex items-center gap-1",
                        mode === m
                          ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]"
                          : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.10] text-zinc-600 dark:text-zinc-300"
                      )}
                    >
                      {m === "facture" ? <FileText className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
                      {m === "facture" ? "Facture" : "Carte cadeau"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={add}
                  className="text-xs px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 font-medium"
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs px-2.5 py-1.5 rounded-md border border-dashed border-zinc-300 dark:border-white/[0.12] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un apport
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
