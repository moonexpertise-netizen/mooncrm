"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import {
  setClientTvaTag,
  setClientTvaEcheanceJour,
} from "@/app/parametrage/tva-tags/actions";

const DOT_COLORS: Record<string, string> = {
  zinc: "bg-zinc-400 dark:bg-zinc-500",
  sky: "bg-sky-400 dark:bg-sky-500",
  emerald: "bg-emerald-400 dark:bg-emerald-500",
  amber: "bg-amber-400 dark:bg-amber-500",
  violet: "bg-violet-400 dark:bg-violet-500",
  rose: "bg-rose-400 dark:bg-rose-500",
  teal: "bg-teal-400 dark:bg-teal-500",
  indigo: "bg-indigo-400 dark:bg-indigo-500",
};

export default function TvaFieldsCard({
  clientId,
  initialTagId,
  initialEcheanceJour,
  tags,
}: {
  clientId: string;
  initialTagId: string | null;
  initialEcheanceJour: number | null;
  tags: Array<{ id: string; label: string; color: string; actif: boolean }>;
}) {
  const canEdit = useCan("edit_clients");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tagId, setTagId] = useState(initialTagId);
  const [jour, setJour] = useState<string>(
    initialEcheanceJour !== null ? String(initialEcheanceJour) : ""
  );

  function onChangeTag(next: string | null) {
    setTagId(next);
    startTransition(async () => {
      try {
        await setClientTvaTag(clientId, next);
        router.refresh();
      } catch (e) {
        toastError(e, "Échec sauvegarde étiquette");
        setTagId(initialTagId); // revert
      }
    });
  }

  function onBlurJour() {
    const trimmed = jour.trim();
    let parsed: number | null = null;
    if (trimmed !== "") {
      const n = parseInt(trimmed, 10);
      if (Number.isNaN(n) || n < 1 || n > 31) {
        toastError(new Error("Le jour doit être un nombre entre 1 et 31"), "Valeur invalide");
        setJour(initialEcheanceJour !== null ? String(initialEcheanceJour) : "");
        return;
      }
      parsed = n;
    }
    if (parsed === initialEcheanceJour) return;
    startTransition(async () => {
      try {
        await setClientTvaEcheanceJour(clientId, parsed);
        router.refresh();
      } catch (e) {
        toastError(e, "Échec sauvegarde jour d'échéance");
        setJour(initialEcheanceJour !== null ? String(initialEcheanceJour) : "");
      }
    });
  }

  const current = tags.find((t) => t.id === tagId) ?? null;

  return (
    <div className="space-y-3">
      {/* Tag TVA */}
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-400 shrink-0">
          Étiquette TVA
        </label>
        <div className="flex items-center gap-2">
          {tags.length === 0 ? (
            <Link
              href="/parametrage/tva-tags"
              className="text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-zinc-300 dark:border-white/[0.10] hover:border-zinc-400 dark:hover:border-white/[0.20] transition-colors"
            >
              <Settings2 className="h-3 w-3" />
              Créer une étiquette
            </Link>
          ) : (
            <select
              value={tagId ?? ""}
              onChange={(e) => onChangeTag(e.target.value || null)}
              disabled={!canEdit}
              className={cn(
                "px-2 py-1 rounded-md border text-[13px] focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white dark:bg-white/[0.04]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                current
                  ? "border-zinc-300 dark:border-white/[0.12] text-zinc-800 dark:text-zinc-200"
                  : "border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400"
              )}
            >
              <option value="">— Aucune —</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {!t.actif ? " (inactif)" : ""}
                </option>
              ))}
            </select>
          )}
          {current && (
            <span
              className={cn(
                "inline-block w-2.5 h-2.5 rounded-full shrink-0",
                DOT_COLORS[current.color] ?? DOT_COLORS.zinc
              )}
              title={`Couleur ${current.color}`}
            />
          )}
        </div>
      </div>

      {/* Jour d'echeance */}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 dark:border-white/[0.06] pt-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-400 shrink-0">
          Jour d&apos;échéance
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={31}
            value={jour}
            onChange={(e) => setJour(e.target.value)}
            onBlur={onBlurJour}
            disabled={!canEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setJour(initialEcheanceJour !== null ? String(initialEcheanceJour) : "");
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder="24"
            className="w-16 px-2 py-1 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-[13px] tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
            du mois suivant
          </span>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        L&apos;étiquette catégorise ce dossier dans le tracker TVA mensuelle (Express, Standard, + longue…). Le jour d&apos;échéance personnalise la date due par client (par défaut : 24).
      </p>
    </div>
  );
}
