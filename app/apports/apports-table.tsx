"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, FileText, Check, Trash2 } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { useCan } from "@/app/_components/permissions-context";
import { toastError } from "@/lib/toast-helpers";
import { setApportRegle, deleteApport } from "./actions";

export type ApportListRow = {
  id: string;
  apporteur: string;
  montant: number;
  mode: "facture" | "carte_cadeau";
  regle: boolean;
  regle_at: string | null;
  note: string | null;
  created_at: string;
  denomination: string;
  slug: string;
};

type StatutFilter = "a_regler" | "regle" | "tous";
type ModeFilter = "tous" | "facture" | "carte_cadeau";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function ApportsTable({ rows }: { rows: ApportListRow[] }) {
  const canEdit = useCan("edit_facturation");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [statut, setStatut] = useState<StatutFilter>("a_regler");
  const [mode, setMode] = useState<ModeFilter>("tous");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statut === "a_regler" && r.regle) return false;
      if (statut === "regle" && !r.regle) return false;
      if (mode !== "tous" && r.mode !== mode) return false;
      return true;
    });
  }, [rows, statut, mode]);

  // Totaux calculés sur les apports À RÉGLER (le pilotage utile).
  const totaux = useMemo(() => {
    const aRegler = rows.filter((r) => !r.regle);
    const sum = (arr: ApportListRow[]) => arr.reduce((s, r) => s + r.montant, 0);
    return {
      aReglerTotal: sum(aRegler),
      aReglerFacture: sum(aRegler.filter((r) => r.mode === "facture")),
      aReglerCarte: sum(aRegler.filter((r) => r.mode === "carte_cadeau")),
      nbARegler: aRegler.length,
    };
  }, [rows]);

  function toggle(id: string, regle: boolean) {
    startTransition(async () => {
      try {
        await setApportRegle(id, regle);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la mise à jour");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteApport(id);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la suppression");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Totaux à régler */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label={`À régler (${totaux.nbARegler})`} value={fmtEuro(totaux.aReglerTotal)} accent="amber" />
        <StatTile label="Via facture" value={fmtEuro(totaux.aReglerFacture)} icon="facture" />
        <StatTile label="Via carte cadeau" value={fmtEuro(totaux.aReglerCarte)} icon="carte" />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={statut}
          onChange={(v) => setStatut(v as StatutFilter)}
          options={[
            { value: "a_regler", label: "À régler" },
            { value: "regle", label: "Réglés" },
            { value: "tous", label: "Tous" },
          ]}
        />
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as ModeFilter)}
          options={[
            { value: "tous", label: "Tous modes" },
            { value: "facture", label: "Facture" },
            { value: "carte_cadeau", label: "Carte cadeau" },
          ]}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-white/[0.06]">
              <th className="px-3 py-2.5 font-medium">Dossier</th>
              <th className="px-3 py-2.5 font-medium">Apporteur</th>
              <th className="px-3 py-2.5 font-medium text-right">Montant</th>
              <th className="px-3 py-2.5 font-medium">Mode</th>
              <th className="px-3 py-2.5 font-medium">Statut</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              {canEdit && <th className="px-3 py-2.5 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-zinc-50 dark:border-white/[0.04] last:border-0 hover:bg-zinc-50/60 dark:hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  {r.slug ? (
                    <Link href={`/clients/${r.slug}`} className="font-medium hover:text-[hsl(var(--gold-dark))] dark:hover:text-[hsl(var(--gold))] transition-colors">
                      {r.denomination}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.denomination}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">{r.apporteur}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtEuro(r.montant)}</td>
                <td className="px-3 py-2.5">
                  <span className={cn("inline-flex items-center gap-1 text-xs", r.mode === "facture" ? "text-blue-600 dark:text-blue-300" : "text-pink-600 dark:text-pink-300")}>
                    {r.mode === "facture" ? <FileText className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
                    {r.mode === "facture" ? "Facture" : "Carte cadeau"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {r.regle ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/25">
                      Réglé {r.regle_at ? `· ${fmtDate(r.regle_at)}` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200 dark:border-amber-500/25">
                      À régler
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 tabular-nums">{fmtDate(r.created_at)}</td>
                {canEdit && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(r.id, !r.regle)}
                        className={cn(
                          "px-2 py-1 rounded-md text-xs font-medium border transition-colors inline-flex items-center gap-1",
                          r.regle
                            ? "border-zinc-200 dark:border-white/[0.10] text-zinc-500 hover:bg-zinc-50 dark:hover:bg-white/[0.06]"
                            : "border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                        )}
                      >
                        <Check className="h-3 w-3" />
                        {r.regle ? "Annuler" : "Marquer réglé"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        title="Supprimer"
                        className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-3 py-8 text-center text-sm text-zinc-400">
                  Aucun apport {statut === "a_regler" ? "à régler" : statut === "regle" ? "réglé" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | null;
  accent?: "amber";
  icon?: "facture" | "carte";
}) {
  return (
    <div className={cn(
      "rounded-xl border px-4 py-3 shadow-card",
      accent === "amber"
        ? "border-amber-200 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/[0.08]"
        : "border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))]"
    )}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-400 flex items-center gap-1.5">
        {icon === "facture" && <FileText className="h-3 w-3 text-blue-500" />}
        {icon === "carte" && <Gift className="h-3 w-3 text-pink-500" />}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value ?? "0 €"}</div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2.5 py-1 rounded-lg text-xs transition-colors",
            value === o.value
              ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-medium"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
