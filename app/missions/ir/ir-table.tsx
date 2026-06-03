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
import { useColumnSelection } from "@/app/_components/use-column-selection";
import { toggleFilterKey } from "@/app/_components/filter-multi-select";
import { Picker } from "@/app/_components/picker";
import { FormModal } from "@/app/_components/form-modal";
import { useLocalStorageSet } from "@/app/_components/use-local-storage-pref";
import { computeEcheanceIR, getUrgencyStatus } from "@/lib/echeances";
import { BulkActionBar } from "@/app/_components/bulk-action-bar";
import { StatusFilterChip } from "@/app/_components/status-filter-chip";

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
  pillYears,
  statusOptions,
}: {
  rows: IrRow[];
  mode: "base" | "year";
  selectedYear: number;
  /** Centre de la fenetre 3-ans. Utilise pour les URLs Base (qui doivent
   *  preserver le center pour ne pas reset a l'annee courante). */
  center: number;
  years: number[];
  /** Fenetre elargie a 6 ans pour les pills de souscription en vue Base.
   *  Si non fourni, fallback sur `years`. */
  pillYears?: number[];
  statusOptions: Record<string, IrStatusOption[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState(rows);
  // Set vide = aucun filtre = "Tous". Multi-select via Cmd/Ctrl+clic
  // (cf. toggleFilterKey). Pattern uniforme sur toute l'app. Persiste dans
  // localStorage (clef moon.ir.statusFilter).
  type StatusGroup = "a_faire" | "en_cours" | "termine";
  const [filter, setFilter] = useLocalStorageSet<StatusGroup>(
    "moon.ir.statusFilter",
    new Set(),
    (k): k is StatusGroup => k === "a_faire" || k === "en_cours" || k === "termine",
  );
  useEffect(() => setLocalRows(rows), [rows]);
  const { confirm, ConfirmDialog } = useConfirm();

  // Helper : groupe statut_logique d'une cell. La logique pour IR : une row
  // matche le filtre si au moins une de ses cells (IR ou IFI) matche.
  function statutGroup(sl: StatutLogique | null | undefined): "a_faire" | "en_cours" | "termine" | "na" {
    if (sl === "TERMINE") return "termine";
    if (sl === "EN_COURS") return "en_cours";
    if (sl === "NON_APPLICABLE") return "na";
    return "a_faire";
  }

  // Vue annee : on n'affiche QUE les clients souscrits a IR ou IFI pour
  // l'annee selectionnee (sinon on listerait "N/A" pour tous, ce qui pollue).
  // Vue base : on affiche tous les clients (c'est le seul endroit pour souscrire).
  const yearRows = useMemo(
    () =>
      mode === "year"
        ? localRows.filter(
            (r) =>
              r.obligations.has(`${selectedYear}|IR`) ||
              r.obligations.has(`${selectedYear}|IFI`)
          )
        : localRows,
    [localRows, mode, selectedYear]
  );

  const visibleRows = useMemo(() => {
    if (mode !== "year" || filter.size === 0) return yearRows;
    return yearRows.filter((r) => {
      const ir = r.obligations.get(`${selectedYear}|IR`);
      const ifi = r.obligations.get(`${selectedYear}|IFI`);
      const gIr = statutGroup(ir?.statut_logique);
      const gIfi = statutGroup(ifi?.statut_logique);
      // Une row matche si au moins une de ses cells est dans un groupe filtre
      return (gIr !== "na" && filter.has(gIr as StatusGroup))
          || (gIfi !== "na" && filter.has(gIfi as StatusGroup));
    });
  }, [yearRows, mode, filter, selectedYear]);

  // Compteurs : on compte le nombre de rows qui ont AT LEAST une cell
  // dans le groupe donne (logique "OR" entre IR et IFI).
  const yearCounts = useMemo(() => {
    const c = { a_faire: 0, en_cours: 0, termine: 0 };
    for (const r of yearRows) {
      const ir = r.obligations.get(`${selectedYear}|IR`);
      const ifi = r.obligations.get(`${selectedYear}|IFI`);
      const groups = new Set<string>([
        statutGroup(ir?.statut_logique),
        statutGroup(ifi?.statut_logique),
      ]);
      if (groups.has("a_faire")) c.a_faire++;
      if (groups.has("en_cours")) c.en_cours++;
      if (groups.has("termine")) c.termine++;
    }
    return c;
  }, [yearRows, selectedYear]);

  // Selection multi-cellules en vue annee : 3 colonnes (IR | IFI | FACT).
  // Selection contrainte a UNE colonne a la fois (useColumnSelection) :
  // cliquer dans IFI alors qu'on a IR selectionne reset la selection vers IFI.
  // Plus simple, plus logique : un libelle IR ne peut pas etre colle dans FACT.
  const COL_IR = 0;
  const COL_IFI = 1;
  const COL_FACT = 2;
  const gridIds = useMemo<(string | null)[][]>(() => {
    if (mode !== "year") return [];
    return visibleRows.map((r) => [
      `${r.id}|IR`,
      `${r.id}|IFI`,
      `${r.id}|FACT`,
    ]);
  }, [visibleRows, mode]);

  // Map cellId selectionnee -> rowId. Utilise par onBulkApply (on sait deja
  // qu'on est dans activeCol, donc tous les ids sont du meme type).
  function rowIdsFromSelection(): string[] {
    const out: string[] = [];
    for (const cid of selectedIds) {
      const [rowId] = cid.split("|");
      if (rowId) out.push(rowId);
    }
    return out;
  }

  // Copy : libelles du statut courant, 1 par ligne (TSV friendly Excel)
  function buildCopyText(col: number): string {
    return rowIdsFromSelection()
      .map((rid) => {
        const r = localRows.find((x) => x.id === rid);
        if (!r) return "";
        if (col === COL_IR) return r.obligations.get(`${selectedYear}|IR`)?.libelle ?? "";
        if (col === COL_IFI) return r.obligations.get(`${selectedYear}|IFI`)?.libelle ?? "";
        if (col === COL_FACT) {
          const f = r.facturations.get(selectedYear);
          const def = FACT_OPTIONS.find((o) => o.key === f);
          return def?.label ?? "";
        }
        return "";
      })
      .join("\n");
  }

  // Paste : 1 valeur = fill-all, sinon positional. Filtre aux libelles
  // valides pour la colonne courante.
  function applyPasteText(text: string, ids: string[], col: number) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0 || ids.length === 0) return;
    const rowIds = ids.map((cid) => cid.split("|")[0]).filter(Boolean);

    if (col === COL_IR || col === COL_IFI) {
      const type: IrType = col === COL_IR ? "IR" : "IFI";
      const opts = statusOptions[`${type}_ANNEE`] ?? [];
      const resolve = (raw: string) => {
        const t = raw.trim();
        if (!t) return null;
        return opts.find((o) => o.libelle.toLowerCase() === t.toLowerCase())?.libelle ?? null;
      };
      const updates = new Map<string, string[]>();
      if (lines.length === 1) {
        const lib = resolve(lines[0]);
        if (!lib) return;
        updates.set(lib, rowIds);
      } else {
        for (let i = 0; i < rowIds.length && i < lines.length; i++) {
          const lib = resolve(lines[i]);
          if (!lib) continue;
          if (!updates.has(lib)) updates.set(lib, []);
          updates.get(lib)!.push(rowIds[i]);
        }
      }
      if (updates.size === 0) return;
      startTransition(async () => {
        try {
          let total = 0;
          for (const [lib, rIds] of updates) {
            const res = await bulkSetIrObligationStatut(rIds, selectedYear, type, lib);
            total += res.updated;
          }
          toastSuccess(`${total} cellule${total > 1 ? "s" : ""} collée${total > 1 ? "s" : ""}`);
          clearSelection();
          router.refresh();
        } catch (e) {
          toastError(e, "Echec collage");
          router.refresh();
        }
      });
      return;
    }

    if (col === COL_FACT) {
      const resolve = (raw: string): EtatFacturation | null => {
        const t = raw.trim().toLowerCase();
        const opt = FACT_OPTIONS.find((o) =>
          o.label.toLowerCase() === t || o.key.toLowerCase() === t
        );
        return opt?.key ?? null;
      };
      const targets: Array<{ id: string; etat: EtatFacturation }> = [];
      if (lines.length === 1) {
        const etat = resolve(lines[0]);
        if (!etat) return;
        for (const id of rowIds) targets.push({ id, etat });
      } else {
        for (let i = 0; i < rowIds.length && i < lines.length; i++) {
          const etat = resolve(lines[i]);
          if (!etat) continue;
          targets.push({ id: rowIds[i], etat });
        }
      }
      if (targets.length === 0) return;
      startTransition(async () => {
        try {
          await Promise.all(targets.map((t) => setIrFacturation(t.id, selectedYear, t.etat)));
          toastSuccess(`${targets.length} facturation${targets.length > 1 ? "s" : ""} collée${targets.length > 1 ? "s" : ""}`);
          clearSelection();
          router.refresh();
        } catch (e) {
          toastError(e, "Echec collage");
          router.refresh();
        }
      });
    }
  }

  const {
    selectedIds,
    selectedCount,
    activeCol,
    focusedPos,
    isSelected,
    onCellClick,
    clearSelection,
    selectAll,
    selectOne,
  } = useColumnSelection(gridIds, {
    onCopy: (ids, col) => {
      const text = buildCopyText(col);
      if (!text) return;
      navigator.clipboard?.writeText?.(text).then(() => {
        toastSuccess(`${ids.length} cellule${ids.length > 1 ? "s" : ""} copiée${ids.length > 1 ? "s" : ""}`);
      }).catch(() => {});
    },
    onPaste: (text, ids, col) => applyPasteText(text, ids, col),
  });

  function onBulkApply(value: string) {
    // value = libelle statut (IR/IFI) OU etat_facturation (FACT).
    // Le type est determine par activeCol (un seul possible a la fois).
    if (activeCol === null) return;
    const ids = rowIdsFromSelection();
    if (ids.length === 0) return;

    // Branche FACT
    if (activeCol === COL_FACT) {
      const etat = value as EtatFacturation;
      setLocalRows((prev) =>
        prev.map((r) => {
          if (!ids.includes(r.id)) return r;
          const newFact = new Map(r.facturations);
          newFact.set(selectedYear, etat);
          return { ...r, facturations: newFact };
        })
      );
      startTransition(async () => {
        try {
          await Promise.all(ids.map((id) => setIrFacturation(id, selectedYear, etat)));
          toastSuccess(`${ids.length} facturation${ids.length > 1 ? "s" : ""} mise${ids.length > 1 ? "s" : ""} à jour`);
          clearSelection();
          router.refresh();
        } catch (e) {
          toastError(e, "Echec mise à jour facturation");
          router.refresh();
        }
      });
      return;
    }

    // Branche IR ou IFI
    const type: IrType = activeCol === COL_IR ? "IR" : "IFI";
    const libelle = value;
    const opts = statusOptions[`${type}_ANNEE`] ?? [];
    const sl = (opts.find((o) => o.libelle === libelle)?.statut_logique ?? "A_FAIRE") as StatutLogique;
    // Optimistic mirror : update du type cible uniquement
    setLocalRows((prev) =>
      prev.map((r) => {
        if (!ids.includes(r.id)) return r;
        const key = `${selectedYear}|${type}`;
        const newObl = new Map(r.obligations);
        newObl.set(key, { annee: selectedYear, type, libelle, statut_logique: sl });
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

        {mode === "year" && (
          <div className="flex items-center gap-1">
            <StatusFilterChip label="Tous" count={yearRows.length} active={filter.size === 0} onClick={() => setFilter(new Set())} />
            <StatusFilterChip label="À faire" count={yearCounts.a_faire} active={filter.has("a_faire")} onClick={(e) => setFilter(toggleFilterKey(filter, "a_faire", e))} accent="amber" />
            <StatusFilterChip label="En cours" count={yearCounts.en_cours} active={filter.has("en_cours")} onClick={(e) => setFilter(toggleFilterKey(filter, "en_cours", e))} accent="sky" />
            <StatusFilterChip label="Terminé" count={yearCounts.termine} active={filter.has("termine")} onClick={(e) => setFilter(toggleFilterKey(filter, "termine", e))} accent="emerald" />
          </div>
        )}

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
          <table
            className="w-full text-sm min-w-[820px] focus:outline-none"
            aria-label="Dossiers IR"
          >
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
              {visibleRows.map((r, rowIdx) => {
                // Selection cellulaire IR/IFI/FACT : composite IDs
                const irCellId = `${r.id}|IR`;
                const ifiCellId = `${r.id}|IFI`;
                const factCellId = `${r.id}|FACT`;
                const irSelected = mode === "year" && isSelected(irCellId);
                const ifiSelected = mode === "year" && isSelected(ifiCellId);
                const factSelected = mode === "year" && isSelected(factCellId);
                const irFocused = mode === "year" && focusedPos?.row === rowIdx && focusedPos?.col === COL_IR;
                const ifiFocused = mode === "year" && focusedPos?.row === rowIdx && focusedPos?.col === COL_IFI;
                const factFocused = mode === "year" && focusedPos?.row === rowIdx && focusedPos?.col === COL_FACT;
                return (
                <tr
                  key={r.id}
                  className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2 min-w-0">
                      {/* Pastille a la racine : urgence reelle (orange/rouge)
                          calculee depuis l'echeance IR (1er janvier N+1 -> fin mai N+1).
                          Avant : pastille rouge des qu'une cellule etait A_FAIRE,
                          meme si echeance lointaine -> bruit visuel. */}
                      {(() => {
                        const checkYears = mode === "year" ? [selectedYear]
                          : Array.from(new Set([...r.obligations.values()].map((o) => o.annee)));
                        let worst: "none" | "due_soon" | "overdue" = "none";
                        for (const yr of checkYears) {
                          for (const t of ["IR", "IFI"] as const) {
                            const cell = r.obligations.get(`${yr}|${t}`);
                            if (!cell) continue;
                            const u = getUrgencyStatus(computeEcheanceIR(yr), cell.statut_logique);
                            if (u === "overdue") { worst = "overdue"; break; }
                            if (u === "due_soon") worst = "due_soon";
                          }
                          if (worst === "overdue") break;
                        }
                        if (worst === "none") return null;
                        return (
                          <span
                            aria-label={worst === "overdue" ? "En retard" : "À traiter"}
                            title={worst === "overdue" ? "Au moins une déclaration en retard" : "Au moins une déclaration à traiter"}
                            className={cn(
                              "mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0",
                              worst === "overdue" ? "bg-rose-500" : "bg-amber-500"
                            )}
                          />
                        );
                      })()}
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
                    </div>
                  </td>
                  {mode === "base" ? (
                    <>
                      <td className="px-3 py-2.5">
                        <Picker
                          value={r.ldm_statut}
                          options={LDM_VALUES}
                          onChange={(v) => onSetLdm(r.id, v)}
                          align="left"
                          minWidth={200}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <YearPills
                          years={pillYears ?? years}
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
                          years={pillYears ?? years}
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
                      <td
                        className={cn(
                          "px-2 py-2.5 text-center transition-colors cursor-pointer",
                          irSelected && "bg-sky-50/80 dark:bg-sky-500/[0.12]",
                          irFocused && "outline outline-1 outline-sky-400 dark:outline-sky-500 outline-offset-[-2px]"
                        )}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                            selectOne(rowIdx, COL_IR);
                            return;
                          }
                          onCellClick(rowIdx, COL_IR, e);
                        }}
                      >
                        <Picker
                          value={r.obligations.get(`${selectedYear}|IR`)?.libelle ?? null}
                          options={(statusOptions["IR_ANNEE"] ?? []).map((o) => ({
                            key: o.libelle,
                            label: o.libelle,
                            color: statutColorClass(o.statut_logique, o.color),
                          }))}
                          onChange={(libelle) => onSetStatut(r.id, "IR", libelle)}
                          onReset={r.obligations.has(`${selectedYear}|IR`) ? () => onSetStatut(r.id, "IR", null) : undefined}
                          resetLabel="Marquer N/A (désouscrire de cette année)"
                          allowEmpty
                          placeholder="N/A"
                          align="center"
                          minWidth={220}
                        />
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 text-center transition-colors cursor-pointer",
                          ifiSelected && "bg-sky-50/80 dark:bg-sky-500/[0.12]",
                          ifiFocused && "outline outline-1 outline-sky-400 dark:outline-sky-500 outline-offset-[-2px]"
                        )}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                            selectOne(rowIdx, COL_IFI);
                            return;
                          }
                          onCellClick(rowIdx, COL_IFI, e);
                        }}
                      >
                        <Picker
                          value={r.obligations.get(`${selectedYear}|IFI`)?.libelle ?? null}
                          options={(statusOptions["IFI_ANNEE"] ?? []).map((o) => ({
                            key: o.libelle,
                            label: o.libelle,
                            color: statutColorClass(o.statut_logique, o.color),
                          }))}
                          onChange={(libelle) => onSetStatut(r.id, "IFI", libelle)}
                          onReset={r.obligations.has(`${selectedYear}|IFI`) ? () => onSetStatut(r.id, "IFI", null) : undefined}
                          resetLabel="Marquer N/A (désouscrire de cette année)"
                          allowEmpty
                          placeholder="N/A"
                          align="center"
                          minWidth={220}
                        />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <EditableForfait
                          value={r.forfaits.get(selectedYear) ?? null}
                          onSave={(v) => onSetForfait(r.id, v)}
                        />
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 text-center transition-colors cursor-pointer",
                          factSelected && "bg-sky-50/80 dark:bg-sky-500/[0.12]",
                          factFocused && "outline outline-1 outline-sky-400 dark:outline-sky-500 outline-offset-[-2px]"
                        )}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                            selectOne(rowIdx, COL_FACT);
                            return;
                          }
                          onCellClick(rowIdx, COL_FACT, e);
                        }}
                      >
                        <Picker
                          value={(r.facturations.get(selectedYear) ?? null) as EtatFacturation | null}
                          options={FACT_OPTIONS}
                          onChange={(v) => onSetFacturation(r.id, v as EtatFacturation)}
                          onReset={() => onSetFacturation(r.id, null)}
                          allowEmpty
                          align="center"
                          minWidth={200}
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
          columnLabel={
            activeCol === COL_IR ? "Statut IR"
            : activeCol === COL_IFI ? "Statut IFI"
            : activeCol === COL_FACT ? "Facturation"
            : undefined
          }
          options={
            activeCol === COL_IR
              ? (statusOptions["IR_ANNEE"] ?? []).map((o) => ({
                  key: o.libelle,
                  label: o.libelle,
                  color: statutColorClass(o.statut_logique, o.color),
                }))
              : activeCol === COL_IFI
              ? (statusOptions["IFI_ANNEE"] ?? []).map((o) => ({
                  key: o.libelle,
                  label: o.libelle,
                  color: statutColorClass(o.statut_logique, o.color),
                }))
              : activeCol === COL_FACT
              ? FACT_OPTIONS.map((o) => ({
                  key: o.key,
                  label: o.label,
                  color: o.color,
                }))
              : []
          }
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
  // Layout 3 colonnes : ~6 ans tiennent sur 2 lignes compactes. Auto-wrap
  // via grid si l'array deborde.
  return (
    <div className="inline-grid grid-cols-3 gap-1 max-w-[160px]">
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
              "px-1.5 py-0.5 rounded text-[10px] tabular-nums font-medium border transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
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

  return (
    <FormModal
      title={`Modifier ${row.nom}`}
      onClose={onClose}
      onSubmit={submit}
      submitDisabled={!nom.trim()}
      isPending={isPending}
      error={error}
    >
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
    </FormModal>
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
