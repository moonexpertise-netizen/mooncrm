"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X, Pencil, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useConfirm } from "@/app/_components/confirm-modal";
import {
  createTimeActivite,
  renameTimeActivite,
  setTimeActiviteActif,
  deleteTimeActivite,
  type TimeActivite,
} from "./actions";

export default function ActivitesManager({ items }: { items: TimeActivite[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function run(fn: () => Promise<unknown>, okMsg?: string) {
    startTransition(async () => {
      try {
        await fn();
        if (okMsg) toastSuccess(okMsg);
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });
  }

  function add() {
    const t = label.trim();
    if (!t) return;
    run(async () => {
      await createTimeActivite(t);
      setLabel("");
    }, "Activité ajoutée");
  }

  function saveRename(id: string) {
    const t = draft.trim();
    if (!t) {
      setEditingId(null);
      return;
    }
    run(async () => {
      await renameTimeActivite(id, t);
      setEditingId(null);
    }, "Activité renommée");
  }

  async function remove(id: string, libelle: string) {
    const ok = await confirm({
      title: `Supprimer « ${libelle} » ?`,
      description:
        "Les saisies passées la perdront (mais ne seront pas supprimées). Astuce : « Masquer » la retire des propositions sans rien perdre.",
      variant: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    run(async () => {
      await deleteTimeActivite(id);
    }, "Activité supprimée");
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      {/* Ajout */}
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Nouvelle activité (ex. Déclaration TVS)…"
          className="h-9 flex-1 px-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        />
        <button
          type="button"
          onClick={add}
          disabled={isPending || !label.trim()}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-gold text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>

      {/* Liste */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card divide-y divide-zinc-100 dark:divide-white/[0.06] overflow-hidden">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Aucune activité. Ajoutez-en une ci-dessus.
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-2.5">
              {editingId === a.id ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(a.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 flex-1 px-2 rounded-md border border-zinc-300 dark:border-white/[0.15] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  />
                  <button
                    type="button"
                    onClick={() => saveRename(a.id)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                    aria-label="Enregistrer"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                    aria-label="Annuler"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      a.actif
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-400 dark:text-zinc-500 line-through"
                    )}
                  >
                    {a.libelle}
                  </span>
                  <button
                    type="button"
                    onClick={() => run(() => setTimeActiviteActif(a.id, !a.actif))}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                    title={a.actif ? "Masquer (ne plus proposer à la saisie)" : "Réactiver"}
                  >
                    {a.actif ? <><Eye className="h-3.5 w-3.5" /> Active</> : <><EyeOff className="h-3.5 w-3.5" /> Masquée</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(a.id);
                      setDraft(a.libelle);
                    }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                    aria-label="Renommer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id, a.libelle)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
