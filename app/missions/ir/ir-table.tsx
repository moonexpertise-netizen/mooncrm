"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { cn, statutColorClass } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import {
  bulkSetIrObligationStatut,
  createClientIr,
  deleteClientIr,
  setIrFacturation,
  setIrForfait,
  setIrObligationStatut,
  toggleIrSubscription,
  updateClientIr,
  type EtatFacturation,
  type IrType,
  type StatutLogique,
} from "./actions";
import { useConfirm } from "@/app/_components/confirm-modal";
import { useRowSelection } from "@/app/_components/use-row-selection";
import { BulkActionBar } from "@/app/_components/bulk-action-bar";

export type IrStatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

export type IrObligationCell = {
  annee: number;
  type: IrType;
  libelle: string | null;
  statut_logique: StatutLogique;
};

export type IrRow = {
  id: string;
  slug: string;
  civilite: "M." | "Mme" | "Mlle" | null;
  prenom: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  ldm_statut: string;
  /** Map "YYYY|IR" ou "YYYY|IFI" -> cell. Si la cle est absente, le client
   *  n'est pas souscrit a cette annee/type (= N/A dans la vue annee). */
  obligations: Map<string, IrObligationCell>;
  /** Map YYYY -> etat_facturation (null si non defini). Partage entre IR et IFI
   *  pour la meme annee. */
  facturations: Map<number, string | null>;
  /** Map YYYY -> forfait (null si non saisi). Commun IR+IFI par annee
   *  (sync via setIrForfait). */
  forfaits: Map<number, number | null>;
};

// Etats facturation : meme palette que missions exceptionnelles
const FACT_OPTIONS: Array<{ key: EtatFacturation; label: string; color: string }> = [
  { key: "a_facturer", label: "À facturer", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "facturee", label: "Facturée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
  { key: "sans_facture", label: "Sans facture", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
];

// Mini-pipeline LDM (4 statuts hardcodes pour l'instant - pourra etre
// migre en status_options scope='ldm_mission' quand Benjamin donnera la
// liste finale)
const LDM_VALUES: Array<{ key: string; label: string; color: string }> = [
  { key: "a_preparer", label: "À préparer", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "propale_acceptee", label: "Propale acceptée", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "ldm_envoyee", label: "LDM envoyée", color: "bg-sky-50 dark:bg-sky-500/25 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/50" },
  { key: "ldm_signee", label: "LDM signée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
];

export default function IrTable({
  rows,
  mode,
  selectedYear,
  center,
  years,
  statusOptions,
}: {
  rows: IrRow[];
  mode: "base" | "year";
  selectedYear: number;
  /** Centre de la fenetre 3-ans. Utilise pour les URLs Base (qui doivent
   *  preserver le center pour ne pas reset a l'annee courante). */
  center: number;
  years: number[];
  statusOptions: Record<string, IrStatusOption[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);
  const { confirm, ConfirmDialog } = useConfirm();

  // Vue annee : on n'affiche QUE les clients souscrits a IR ou IFI pour
  // l'annee selectionnee (sinon on listerait "N/A" pour tous, ce qui pollue).
  // Vue base : on affiche tous les clients (c'est le seul endroit pour souscrire).
  const visibleRows =
    mode === "year"
      ? localRows.filter(
          (r) =>
            r.obligations.has(`${selectedYear}|IR`) ||
            r.obligations.has(`${selectedYear}|IFI`)
        )
      : localRows;

  // Selection multi-rows en vue annee. Pour IR on a 2 colonnes (IR + IFI) :
  // on selectionne la ligne entiere, et le bulk picker propose les statuts
  // prefixes par "IR · " ou "IFI · " pour viser le bon type.
  const orderedIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);
  const { selectedIds, selectedCount, isSelected, onRowClick, clearSelection, selectAll } = useRowSelection(orderedIds);

  function onBulkApply(prefixedKey: string) {
    // Format de la key : "IR:libelle" ou "IFI:libelle"
    const [type, libelle] = prefixedKey.split(":") as [IrType, string];
    if (!libelle || (type !== "IR" && type !== "IFI")) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const opts = statusOptions[`${type}_ANNEE`] ?? [];
    const sl = (opts.find((o) => o.libelle === libelle)?.statut_logique ?? "A_FAIRE") as StatutLogique;
    // Optimistic mirror
    setLocalRows((prev) =>
      prev.map((r) => {
        if (!selectedIds.has(r.id)) return r;
        const key = `${selectedYear}|${type}`;
        const newObl = new Map(r.obligations);
        newObl.set(key, { annee: selectedYear, type, libelle, statut_logique: sl });
        // Auto-facturation si TERMINE
        const newFact = new Map(r.facturations);
        if (sl === "TERMINE" && !newFact.get(selectedYear)) {
          newFact.set(selectedYear, "a_facturer");
        }
        return { ...r, obligations: newObl, facturations: newFact };
      })
    );
    startTransition(async () => {
      try {
        const res = await bulkSetIrObligationStatut(ids, selectedYear, type, libelle);
        toastSuccess(`${res.updated} dossier${res.updated > 1 ? "s" : ""} ${type} mis à jour`);
        clearSelection();
        router.refresh();
      } catch (e) {
        toastError(e, "Echec mise à jour groupée");
        router.refresh();
      }
    });
  }

  function onSetLdm(clientIrId: string, newStatut: string) {
    setLocalRows((prev) =>
      prev.map((r) => (r.id === clientIrId ? { ...r, ldm_statut: newStatut } : r))
    );
    startTransition(async () => {
      try {
        await updateClientIr(clientIrId, { ldm_statut: newStatut });
      } catch (e) {
        toastError(e, "Echec sauvegarde LDM");
        router.refresh();
      }
    });
  }

  function onToggleSubscription(clientIrId: string, annee: number, type: IrType) {
    // Optimistic : on toggle la cell dans la map
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const key = `${annee}|${type}`;
        const newMap = new Map(r.obligations);
        if (newMap.has(key)) {
          newMap.delete(key);
        } else {
          newMap.set(key, {
            annee,
            type,
            libelle: "À faire",
            statut_logique: "A_FAIRE",
          });
        }
        return { ...r, obligations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await toggleIrSubscription(clientIrId, annee, type);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec toggle souscription");
        router.refresh();
      }
    });
  }

  function onSetFacturation(clientIrId: string, etat: EtatFacturation | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const newMap = new Map(r.facturations);
        newMap.set(selectedYear, etat);
        return { ...r, facturations: newMap };
      })
    );
    startTransition(async () => {
      try {
        await setIrFacturation(clientIrId, selectedYear, etat);
      } catch (e) {
        toastError(e, "Echec sauvegarde facturation");
        router.refresh();
      }
    });
  }

  function onSetForfait(clientIrId: string, montant: number | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const newMap = new Map(r.forfaits);
        newMap.set(selectedYear, montant);
        return { ...r, forfaits: newMap };
      })
    );
    startTransition(async () => {
      try {
        await setIrForfait(clientIrId, selectedYear, montant);
      } catch (e) {
        toastError(e, "Echec sauvegarde forfait");
        router.refresh();
      }
    });
  }

  function onSetStatut(clientIrId: string, type: IrType, libelle: string | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientIrId) return r;
        const key = `${selectedYear}|${type}`;
        const newMap = new Map(r.obligations);
        const newFacturations = new Map(r.facturations);
        if (libelle === null) {
          newMap.delete(key);
        } else {
          const opts = statusOptions[`${type}_ANNEE`] ?? [];
          const sl = opts.find((o) => o.libelle === libelle)?.statut_logique ?? "A_FAIRE";
          newMap.set(key, { annee: selectedYear, type, libelle, statut_logique: sl });
          // Auto-facturation : passage en TERMINE + facturation null -> "a_facturer"
          // Cf. trigger DB auto_facturation_on_termine. On replique cote optimistic
          // pour un feedback immediat avant le router.refresh().
          if (sl === "TERMINE" && !newFacturations.get(selectedYear)) {
            newFacturations.set(selectedYear, "a_facturer");
          }
        }
        return { ...r, obligations: newMap, facturations: newFacturations };
      })
    );
    startTransition(async () => {
      try {
        await setIrObligationStatut(clientIrId, selectedYear, type, libelle);
        router.refresh();
      } catch (e) {
        toastError(e, `Echec sauvegarde ${type}`);
        router.refresh();
      }
    });
  }

  async function onDelete(clientIrId: string, fullName: string) {
    const ok = await confirm({
      title: `Supprimer ${fullName} ?`,
      description: "Le dossier IR + toutes ses obligations annuelles seront supprimes.",
      variant: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setLocalRows((prev) => prev.filter((r) => r.id !== clientIrId));
    startTransition(async () => {
      try {
        await deleteClientIr(clientIrId);
        toastSuccess("Dossier IR supprime");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec suppression");
      }
    });
  }

  // Recap par annee : compte les obligations IR + IFI par statut_logique.
  // Sert au sommaire "Que faire ?" en haut de la page. Indep de la vue.
  const yearRecap = useMemo(() => {
    type Stats = { a_faire: number; en_cours: number; termine: number };
    const map = new Map<string, Stats>(); // key = "annee|type"
    for (const r of localRows) {
      for (const cell of r.obligations.values()) {
        const key = `${cell.annee}|${cell.type}`;
        if (!map.has(key)) map.set(key, { a_faire: 0, en_cours: 0, termine: 0 });
        const s = map.get(key)!;
        if (cell.statut_logique === "A_FAIRE") s.a_faire++;
        else if (cell.statut_logique === "EN_COURS") s.en_cours++;
        else if (cell.statut_logique === "TERMINE") s.termine++;
      }
    }
    return map;
  }, [localRows]);

  function statsFor(year: number, type: "IR" | "IFI"): { a_faire: number; en_cours: number; termine: number } {
    return yearRecap.get(`${year}|${type}`) ?? { a_faire: 0, en_cours: 0, termine: 0 };
  }

  // Annees avec au moins une obligation IR ou IFI. On affiche le recap pour
  // TOUTES ces annees + la fenetre 3-ans, peu importe le mode (Base ou Annee) :
  // l'utilisateur veut une vue transversale "que reste-t-il a faire ?" meme
  // quand il est focus sur un exercice precis. Si pas de souscription, on voit
  // quand meme les annees recentes (fenetre 3-ans) pour pouvoir souscrire.
  // Tri descendant (plus recent en haut).
  const recapYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of localRows) {
      for (const cell of r.obligations.values()) set.add(cell.annee);
    }
    for (const y of years) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [localRows, years]);

  // URL helpers. On preserve "center" pour conserver la fenetre 3-ans
  // courante (cf. logique fenetre glissante).
  function urlForBase(c: number = center) {
    return `/missions/ir?view=base&center=${c}`;
  }
  function urlForYear(y: number) {
    return `/missions/ir?year=${y}`;
  }
  // Fleche < : decale la fenetre vers la gauche (center - 1). Si en mode
  // year, on suit (la fenetre se decale, l'annee selectionnee aussi).
  // Si en mode base, on reste en base mais on decale le center.
  const prevCenter = center - 1;
  const nextCenter = center + 1;
  const urlPrev = mode === "year" ? urlForYear(prevCenter) : urlForBase(prevCenter);
  const urlNext = mode === "year" ? urlForYear(nextCenter) : urlForBase(nextCenter);

  return (
    <div className={cn("space-y-3", isPending && "opacity-95")}>
      {ConfirmDialog}

      {/* Onglets Base / Year + bouton ajouter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav
          aria-label="Vue tracker IR"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]"
        >
          <Link
            href={urlForBase()}
            aria-current={mode === "base" ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-all",
              mode === "base"
                ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
            )}
          >
            Base
          </Link>
          {/* Fleche gauche : decale la fenetre 3-ans d'un an en arriere */}
          <Link
            href={urlPrev}
            aria-label="Année précédente"
            title={`Reculer (${prevCenter - 1} à ${prevCenter + 1})`}
            className="px-1.5 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          {years.map((y) => {
            const active = mode === "year" && y === selectedYear;
            return (
              <Link
                key={y}
                href={urlForYear(y)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm tabular-nums transition-all",
                  active
                    ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
                )}
              >
                {y}
              </Link>
            );
          })}
          {/* Fleche droite : decale la fenetre 3-ans d'un an en avant */}
          <Link
            href={urlNext}
            aria-label="Année suivante"
            title={`Avancer (${nextCenter - 1} à ${nextCenter + 1})`}
            className="px-1.5 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau dossier IR
          </button>
        )}
      </div>

      {/* Recap par annee. Vue Base : TOUTES les annees avec obligations (vue
          globale, voir tout d'un coup). Vue annee : fenetre 3-ans (focus sur
          l'annee selectionnee). Grid auto-fit pour s'adapter au nombre de
          cards : 1 col mobile -> N cols desktop selon la largeur. */}
      {recapYears.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {recapYears.map((y) => {
            const ir = statsFor(y, "IR");
            const ifi = statsFor(y, "IFI");
            const irTotal = ir.a_faire + ir.en_cours + ir.termine;
            const ifiTotal = ifi.a_faire + ifi.en_cours + ifi.termine;
            const irPct = irTotal > 0 ? Math.round((ir.termine / irTotal) * 100) : 0;
            const ifiPct = ifiTotal > 0 ? Math.round((ifi.termine / ifiTotal) * 100) : 0;
            const active = mode === "year" && y === selectedYear;
            return (
              <Link
                key={y}
                href={urlForYear(y)}
                className={cn(
                  "block rounded-xl border bg-white dark:bg-[hsl(var(--card))] shadow-card p-3 space-y-2 transition-colors",
                  active
                    ? "border-zinc-400 dark:border-white/30 ring-1 ring-zinc-300 dark:ring-white/20"
                    : "border-zinc-200 dark:border-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.16]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{y}</span>
                  {(irTotal + ifiTotal) === 0 && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">aucune souscription</span>
                  )}
                </div>
                {irTotal > 0 && (
                  <RecapLine label="IR" stats={ir} pct={irPct} />
                )}
                {ifiTotal > 0 && (
                  <RecapLine label="IFI" stats={ifi} pct={ifiPct} />
                )}
              </Link>
            );
          })}
        </div>
      )}

      {adding && (
        <NewClientIrForm onCancel={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} />
      )}

      {editingId && (() => {
        const target = localRows.find((r) => r.id === editingId);
        if (!target) return null;
        return (
          <EditClientIrModal
            row={target}
            onClose={() => setEditingId(null)}
            onSaved={(patch) => {
              setLocalRows((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...patch } : r)));
              setEditingId(null);
              router.refresh();
            }}
          />
        );
      })()}

      {/* Table */}
      {visibleRows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          {localRows.length === 0
            ? "Aucun dossier IR pour l'instant. Clique sur « Nouveau dossier IR » pour commencer."
            : `Aucun dossier souscrit pour l'exercice ${selectedYear}. Passe en vue « Base » pour souscrire des années.`}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm min-w-[820px]" aria-label="Dossiers IR">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Nom</th>
                {mode === "base" ? (
                  <>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Statut LDM</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">IR · années</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">IFI · années</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">IR {selectedYear}</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">IFI {selectedYear}</th>
                    <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[120px]" title="Forfait d'honoraires IR + IFI (HT)">Forfait HT</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Facturation</th>
                  </>
                )}
                <th scope="col" className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {visibleRows.map((r) => {
                const selected = mode === "year" && isSelected(r.id);
                return (
                <tr
                  key={r.id}
                  className={cn(
                    "transition-colors",
                    selected
                      ? "bg-sky-50/60 dark:bg-sky-500/[0.08] hover:bg-sky-50 dark:hover:bg-sky-500/[0.12]"
                      : "hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                  )}
                  onClick={mode === "year" ? (e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) return;
                    onRowClick(r.id, e);
                  } : undefined}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {[r.civilite, r.prenom, r.nom].filter(Boolean).join(" ")}
                      </span>
                      {(r.email || r.telephone) && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[280px]">
                          {[r.email, r.telephone].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </td>
                  {mode === "base" ? (
                    <>
                      <td className="px-3 py-2.5">
                        <LdmPicker value={r.ldm_statut} onChange={(v) => onSetLdm(r.id, v)} />
                      </td>
                      <td className="px-3 py-2.5">
                        <YearPills
                          years={years}
                          subscribedYears={new Set(
                            Array.from(r.obligations.values())
                              .filter((c) => c.type === "IR")
                              .map((c) => c.annee)
                          )}
                          onToggle={(year) => onToggleSubscription(r.id, year, "IR")}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <YearPills
                          years={years}
                          subscribedYears={new Set(
                            Array.from(r.obligations.values())
                              .filter((c) => c.type === "IFI")
                              .map((c) => c.annee)
                          )}
                          onToggle={(year) => onToggleSubscription(r.id, year, "IFI")}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2.5 text-center">
                        <StatutCell
                          cell={r.obligations.get(`${selectedYear}|IR`) ?? null}
                          options={statusOptions["IR_ANNEE"] ?? []}
                          onPick={(libelle) => onSetStatut(r.id, "IR", libelle)}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <StatutCell
                          cell={r.obligations.get(`${selectedYear}|IFI`) ?? null}
                          options={statusOptions["IFI_ANNEE"] ?? []}
                          onPick={(libelle) => onSetStatut(r.id, "IFI", libelle)}
                        />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <EditableForfait
                          value={r.forfaits.get(selectedYear) ?? null}
                          onSave={(v) => onSetForfait(r.id, v)}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <FacturationPicker
                          value={(r.facturations.get(selectedYear) ?? null) as EtatFacturation | null}
                          onChange={(v) => onSetFacturation(r.id, v)}
                        />
                      </td>
                    </>
                  )}
                  <td className="px-2 py-3 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        onClick={() => setEditingId(r.id)}
                        className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
                        aria-label={`Modifier ${r.nom}`}
                        title="Modifier le dossier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(r.id, [r.prenom, r.nom].filter(Boolean).join(" "))}
                        className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        aria-label={`Supprimer ${r.nom}`}
                        title="Supprimer le dossier"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {visibleRows.length} dossier{visibleRows.length > 1 ? "s" : ""} IR
          {mode === "year" ? ` souscrit${visibleRows.length > 1 ? "s" : ""} - exercice ${selectedYear}` : " - vue d'ensemble"}
          {mode === "year" && localRows.length !== visibleRows.length && ` (sur ${localRows.length} au total)`}.
        </p>
        {mode === "year" && visibleRows.length > 0 && (
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Tout sélectionner
          </button>
        )}
      </div>

      {mode === "year" && (
        <BulkActionBar
          count={selectedCount}
          onClear={clearSelection}
          hint="clic + shift / cmd · choisir IR ou IFI dans le picker"
          label="Statut IR / IFI"
          options={[
            ...(statusOptions["IR_ANNEE"] ?? []).map((o) => ({
              key: `IR:${o.libelle}`,
              label: o.libelle,
              color: statutColorClass(o.statut_logique, o.color),
              group: "IR",
            })),
            ...(statusOptions["IFI_ANNEE"] ?? []).map((o) => ({
              key: `IFI:${o.libelle}`,
              label: o.libelle,
              color: statutColorClass(o.statut_logique, o.color),
              group: "IFI",
            })),
          ]}
          onApply={onBulkApply}
        />
      )}
    </div>
  );
}

// ============================================================================
//  YearPills - pills cliquables pour activer/desactiver une annee (vue Base)
// ============================================================================

// ============================================================================
//  RecapLine - ligne de stats pour le sommaire par annee.
//  Affiche : type | A faire / En cours / Termine + barre de progression.
// ============================================================================

function RecapLine({
  label,
  stats,
  pct,
}: {
  label: string;
  stats: { a_faire: number; en_cours: number; termine: number };
  pct: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">{label}</span>
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
            <span className={cn(stats.a_faire > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
              {stats.a_faire} à faire
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span className={cn(stats.en_cours > 0 ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
              {stats.en_cours} en cours
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span className={cn(stats.termine > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
              {stats.termine} fait
            </span>
          </div>
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-emerald-500 dark:bg-emerald-400/70 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function YearPills({
  years,
  subscribedYears,
  onToggle,
}: {
  years: number[];
  subscribedYears: Set<number>;
  onToggle: (year: number) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {years.map((y) => {
        const subscribed = subscribedYears.has(y);
        return (
          <button
            key={y}
            type="button"
            onClick={() => onToggle(y)}
            aria-pressed={subscribed}
            title={subscribed ? `Souscrit ${y} · clic pour retirer` : `Non souscrit ${y} · clic pour ajouter`}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] tabular-nums font-medium border transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
              subscribed
                ? "bg-zinc-200 dark:bg-white/[0.14] text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-white/[0.20]"
                : "bg-transparent text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10] hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
//  StatutCell - picker statut style Notion (utilise dans vue annee)
//  Si cell === null : affiche "N/A" en pointille (pas souscrit) avec clic
//  qui ouvre le picker pour souscrire + choisir un statut directement.
// ============================================================================

function StatutCell({
  cell,
  options,
  onPick,
}: {
  cell: IrObligationCell | null;
  options: IrStatusOption[];
  onPick: (libelle: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!open || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-statut-btn]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 220;
    const POPOVER_WIDTH = 220;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const rawLeft = rect.left + rect.width / 2;
    const halfW = POPOVER_WIDTH / 2;
    const clampedLeft = Math.max(
      MARGIN + halfW,
      Math.min(rawLeft, window.innerWidth - MARGIN - halfW)
    );
    setPos({
      left: clampedLeft,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
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

  const isSubscribed = cell !== null;

  return (
    <div ref={ref} className="inline-block">
      <button
        data-statut-btn="1"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-block min-w-[90px] px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
          isSubscribed
            ? statutColorClass(cell!.statut_logique, null)
            : "bg-zinc-50 dark:bg-white/[0.04] border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-400 dark:text-zinc-500"
        )}
      >
        {isSubscribed ? cell!.libelle ?? "À faire" : "N/A"}
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translate(-50%, calc(-100% - 8px))" : "translate(-50%, 8px)",
              zIndex: 1000,
            }}
            className="min-w-[220px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b dark:border-white/[0.06]">
              Statut
            </div>
            <div className="py-1 max-h-[260px] overflow-y-auto">
              {options.map((o) => (
                <button
                  key={o.libelle}
                  type="button"
                  onClick={() => {
                    onPick(o.libelle);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                    cell?.libelle === o.libelle && "bg-zinc-50 dark:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", statutColorClass(o.statut_logique, o.color))}>
                    {o.libelle}
                  </span>
                  {cell?.libelle === o.libelle && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
            {isSubscribed && (
              <div className="border-t dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Marquer N/A (désouscrire de cette année)
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  LdmPicker
// ============================================================================

function LdmPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = LDM_VALUES.find((v) => v.key === value) ?? LDM_VALUES[0];

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = LDM_VALUES.length * 32 + 16;
    const POPOVER_WIDTH = 200;
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

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
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
            className="min-w-[200px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {LDM_VALUES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => {
                  onChange(v.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                  value === v.key && "bg-zinc-50 dark:bg-white/[0.04]"
                )}
              >
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", v.color)}>{v.label}</span>
                {value === v.key && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  FacturationPicker - picker generique 3 etats (a_facturer / facturee
//  / sans_facture). Affiche un placeholder "-" quand null.
// ============================================================================

function FacturationPicker({
  value,
  onChange,
}: {
  value: EtatFacturation | null;
  onChange: (v: EtatFacturation | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = value ? FACT_OPTIONS.find((o) => o.key === value) : null;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = FACT_OPTIONS.length * 32 + 50;
    const POPOVER_WIDTH = 200;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
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

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 min-w-[90px] justify-center",
          current
            ? current.color
            : "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]"
        )}
      >
        {current ? current.label : "-"}
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
            className="min-w-[200px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {FACT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                  value === o.key && "bg-zinc-50 dark:bg-white/[0.04]"
                )}
              >
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>{o.label}</span>
                {value === o.key && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
              </button>
            ))}
            {value !== null && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
              >
                Réinitialiser
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  EditClientIrModal - modifie un dossier IR existant
// ============================================================================

function EditClientIrModal({
  row,
  onClose,
  onSaved,
}: {
  row: IrRow;
  onClose: () => void;
  onSaved: (patch: Partial<IrRow>) => void;
}) {
  const [civilite, setCivilite] = useState<"M." | "Mme" | "Mlle" | "">(row.civilite ?? "");
  const [prenom, setPrenom] = useState(row.prenom ?? "");
  const [nom, setNom] = useState(row.nom);
  const [email, setEmail] = useState(row.email ?? "");
  const [telephone, setTelephone] = useState(row.telephone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!nom.trim()) {
      setError("Nom obligatoire");
      return;
    }
    setError(null);
    const patch: Record<string, string | null> = {
      civilite: civilite || null,
      prenom: prenom.trim() || null,
      nom: nom.trim(),
      email: email.trim() || null,
      telephone: telephone.trim() || null,
    };
    startTransition(async () => {
      try {
        await updateClientIr(row.id, patch);
        toastSuccess("Dossier mis à jour");
        onSaved({
          civilite: (civilite || null) as IrRow["civilite"],
          prenom: prenom.trim() || null,
          nom: nom.trim(),
          email: email.trim() || null,
          telephone: telephone.trim() || null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastError(e, "Echec mise à jour");
      }
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Modifier {row.nom}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <select
              value={civilite}
              onChange={(e) => setCivilite(e.target.value as "M." | "Mme" | "Mlle" | "")}
              className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
            >
              <option value="">- Civ. -</option>
              <option value="M.">M.</option>
              <option value="Mme">Mme</option>
              <option value="Mlle">Mlle</option>
            </select>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm" />
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom *" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm" />
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" type="tel" className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums" />
          </div>
          {error && <div className="text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
        </div>

        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isPending} className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={isPending || !nom.trim()} className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isPending ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
//  NewClientIrForm
// ============================================================================

function NewClientIrForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [civilite, setCivilite] = useState<"M." | "Mme" | "Mlle" | "">("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!nom.trim()) {
      setError("Nom obligatoire");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createClientIr({
          civilite: (civilite || null) as "M." | "Mme" | "Mlle" | null,
          prenom: prenom || null,
          nom,
          email: email || null,
          telephone: telephone || null,
        });
        toastSuccess("Dossier IR cree");
        onCreated();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastError(e, "Echec creation");
      }
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4 shadow-card space-y-3">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nouveau dossier IR</div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <select
          value={civilite}
          onChange={(e) => setCivilite(e.target.value as "M." | "Mme" | "Mlle" | "")}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        >
          <option value="">- Civ. -</option>
          <option value="M.">M.</option>
          <option value="Mme">Mme</option>
          <option value="Mlle">Mlle</option>
        </select>
        <input
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          placeholder="Prénom"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom *"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        />
        <input
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Téléphone"
          type="tel"
          inputMode="tel"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums"
        />
      </div>
      {error && <div className="text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !nom.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Création…" : "Créer"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
//  EditableForfait - saisie inline d'un montant en euros (cellule par annee)
// ============================================================================

function EditableForfait({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value === null ? "" : String(value));
  useEffect(() => setLocal(value === null ? "" : String(value)), [value]);

  function commit() {
    setEditing(false);
    const t = local.trim().replace(",", ".");
    if (t === "") {
      if (value !== null) onSave(null);
      return;
    }
    const n = Number(t);
    if (Number.isNaN(n) || n < 0) {
      setLocal(value === null ? "" : String(value));
      return;
    }
    if (n !== value) onSave(n);
  }

  if (editing) {
    return (
      <input
        type="number"
        value={local}
        step={50}
        min={0}
        max={9999999}
        aria-label="Forfait d'honoraires en euros"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter declenche blur -> commit (un seul appel garanti).
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value === null ? "" : String(value));
            setEditing(false);
          }
        }}
        autoFocus
        className="w-full text-right px-1.5 py-0.5 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 tabular-nums"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "w-full text-right px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors tabular-nums text-sm",
        value === null
          ? "text-zinc-400 dark:text-zinc-500 italic"
          : "text-zinc-900 dark:text-zinc-100"
      )}
      title="Forfait d'honoraires (€ HT)"
    >
      {value === null
        ? "-"
        : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} € HT`}
    </button>
  );
}
