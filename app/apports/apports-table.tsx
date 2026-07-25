"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Gift, FileText, Check, Trash2, Plus, X } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { useCan } from "@/app/_components/permissions-context";
import { toastError } from "@/lib/toast-helpers";
import { setApportRegle, deleteApport, createApport, type ApportMode } from "./actions";

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

export default function ApportsTable({
  rows,
  clients,
  apporteurs,
}: {
  rows: ApportListRow[];
  clients: { id: string; denomination: string }[];
  apporteurs: string[];
}) {
  const canEdit = useCan("edit_facturation");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [statut, setStatut] = useState<StatutFilter>("a_regler");
  const [mode, setMode] = useState<ModeFilter>("tous");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statut === "a_regler" && r.regle) return false;
      if (statut === "regle" && !r.regle) return false;
      if (mode !== "tous" && r.mode !== mode) return false;
      return true;
    });
  }, [rows, statut, mode]);

  // Matrice de totalisation : statut (à régler / réglé) × mode (facture /
  // carte cadeau), avec totaux de lignes et de colonnes. Calculée sur TOUS
  // les apports (indépendante des filtres) pour rester un tableau de bord stable.
  const M = useMemo(() => {
    const g = {
      aRegler: { facture: 0, carte: 0, n: 0 },
      regle: { facture: 0, carte: 0, n: 0 },
    };
    for (const r of rows) {
      const b = r.regle ? g.regle : g.aRegler;
      b.n += 1;
      if (r.mode === "facture") b.facture += r.montant;
      else b.carte += r.montant;
    }
    const rowTot = (b: { facture: number; carte: number }) => b.facture + b.carte;
    return {
      g,
      aReglerTot: rowTot(g.aRegler),
      regleTot: rowTot(g.regle),
      colFacture: g.aRegler.facture + g.regle.facture,
      colCarte: g.aRegler.carte + g.regle.carte,
      grand: rowTot(g.aRegler) + rowTot(g.regle),
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
      {/* Matrice de totalisation : statut × mode */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-white/[0.06]">
              <th className="px-4 py-2.5 text-left font-medium">Statut</th>
              <th className="px-4 py-2.5 text-right font-medium">
                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3 text-blue-500" />Facture</span>
              </th>
              <th className="px-4 py-2.5 text-right font-medium">
                <span className="inline-flex items-center gap-1"><Gift className="h-3 w-3 text-pink-500" />Carte cadeau</span>
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-zinc-500 dark:text-zinc-300">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b border-zinc-50 dark:border-white/[0.04] bg-amber-50/40 dark:bg-amber-500/[0.06]">
              <td className="px-4 py-2.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                  À régler ({M.g.aRegler.n})
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">{fmtEuro(M.g.aRegler.facture)}</td>
              <td className="px-4 py-2.5 text-right">{fmtEuro(M.g.aRegler.carte)}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-amber-800 dark:text-amber-200">{fmtEuro(M.aReglerTot)}</td>
            </tr>
            <tr className="border-b border-zinc-50 dark:border-white/[0.04]">
              <td className="px-4 py-2.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Réglé ({M.g.regle.n})
                </span>
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">{fmtEuro(M.g.regle.facture)}</td>
              <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">{fmtEuro(M.g.regle.carte)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-zinc-600 dark:text-zinc-300">{fmtEuro(M.regleTot)}</td>
            </tr>
            <tr className="border-t border-zinc-200 dark:border-white/[0.10] font-semibold">
              <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-300">Total</td>
              <td className="px-4 py-2.5 text-right">{fmtEuro(M.colFacture)}</td>
              <td className="px-4 py-2.5 text-right">{fmtEuro(M.colCarte)}</td>
              <td className="px-4 py-2.5 text-right">{fmtEuro(M.grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Filtres + ajout */}
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
        {canEdit && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un apport
          </button>
        )}
      </div>

      {addOpen && (
        <AddApportModal
          clients={clients}
          apporteurs={apporteurs}
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}

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

/** Modale d'ajout d'un apport : on choisit le dossier (combobox), l'apporteur
 *  (autocomplétion), le montant et le mode. */
function AddApportModal({
  clients,
  apporteurs,
  onClose,
  onDone,
}: {
  clients: { id: string; denomination: string }[];
  apporteurs: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [apporteur, setApporteur] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState<ApportMode>("facture");
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.denomination.toLowerCase().includes(q)).slice(0, 8);
  }, [clientQuery, clients]);

  function selectClient(c: { id: string; denomination: string }) {
    setClientId(c.id);
    setClientQuery(c.denomination);
    setListOpen(false);
  }

  function submit() {
    if (!clientId) return toastError("Choisis un dossier.");
    const m = parseFloat(montant.replace(",", "."));
    if (!apporteur.trim()) return toastError("Nom de l'apporteur obligatoire.");
    if (!Number.isFinite(m) || m < 0) return toastError("Montant invalide.");
    startTransition(async () => {
      try {
        await createApport({ clientId, apporteur: apporteur.trim(), montant: m, mode });
        onDone();
      } catch (e) {
        toastError(e, "Echec de l'ajout de l'apport");
      }
    });
  }

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";
  const labelCls = "text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/50 dark:bg-[hsl(226_85%_3%_/_0.6)] backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ajouter un apport d&apos;affaires</h3>
          <button type="button" onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Combobox dossier */}
          <div className="relative" ref={boxRef}>
            <label className={labelCls}>Dossier</label>
            <input
              value={clientQuery}
              onChange={(e) => { setClientQuery(e.target.value); setClientId(null); setListOpen(true); }}
              onFocus={() => setListOpen(true)}
              onBlur={() => setTimeout(() => setListOpen(false), 150)}
              placeholder="Rechercher un dossier…"
              className={cn(inputCls, clientId ? "border-emerald-300 dark:border-emerald-500/40" : "")}
            />
            {listOpen && matches.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-[hsl(var(--card))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-xl max-h-56 overflow-auto py-1">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectClient(c)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors truncate"
                  >
                    {c.denomination}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Apporteur</label>
            <input
              list="apporteurs-list-modal"
              value={apporteur}
              onChange={(e) => setApporteur(e.target.value)}
              placeholder="Nom de l'apporteur"
              className={inputCls}
            />
            <datalist id="apporteurs-list-modal">
              {apporteurs.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <label className={labelCls}>Montant</label>
              <input
                inputMode="decimal"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0"
                className={cn(inputCls, "pr-6 tabular-nums")}
              />
              <span className="absolute right-2 top-[30px] text-xs text-zinc-400">€</span>
            </div>
            <div>
              <label className={labelCls}>Mode</label>
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
                    {m === "facture" ? "Facture" : "Carte"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !clientId || !apporteur.trim() || !montant.trim()}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              !pending && clientId && apporteur.trim() && montant.trim()
                ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
                : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            )}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>,
    document.body
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
