"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, MoveHorizontal, X, Copy, Inbox } from "lucide-react";
import { cn, fmtDateFr, statutColorClass } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import {
  bulkUpdateObligationStatus,
  setEcheanceStatus,
  setObligationFacturation,
  updateObligationStatus,
} from "../actions";
import { createPortal } from "react-dom";
import CommentsPopover from "./comments-panel";
import { StatusFilterChip } from "@/app/_components/status-filter-chip";
import { MobileFilterSelect } from "@/app/_components/mobile-filter-select";
import { toggleFilterKey } from "@/app/_components/filter-multi-select";
import { setClientTvaTag } from "@/app/parametrage/tva-tags/actions";
import { computeEcheance, getUrgencyStatus, extractAnneeFromPeriode, type UrgencyStatus } from "@/lib/echeances";

type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export type StatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

/** Référence stable pour les listes d'options vides. Sans ça,
 *  `statusOptions[c.type] ?? []` crée un nouveau tableau à CHAQUE render →
 *  la prop `options` de StatusCell change de référence → le memo casse et
 *  les ~960 cellules se re-render à chaque frappe. Une constante module
 *  garde la même référence. */
const EMPTY_OPTIONS: StatusOption[] = [];

/** Etats facturation : aligne sur missions exc/IR/CAA. */
export type EtatFacturation = "a_facturer" | "facturee" | "sans_facture" | "offert";

export type TrackerCell = {
  colKey: string;
  obligationId: string | null;
  type: string;
  statut_logique: StatutLogique | null;
  statut_detail: string | null;
  echeance: string | null;
  note: string | null;
  /** Facturation juridique. Seulement utilise pour les types qui exposent un
   *  suivi de facturation (ex. AGO_DEPOT). Null = pas encore decide. */
  etat_facturation: EtatFacturation | null;
};

export type TrackerRow = {
  clientId: string;
  clientSlug: string;
  denomination: string;
  siren: string | null;
  pipeline: string | null;
  origine: string | null;
  /** Type de honoraires bilans : 'Facturés' (separes du forfait) /
   *  'Inclus' (dans le forfait) / null (a renseigner).
   *  Utilise pour decider d'afficher ou pas la pastille facturation
   *  sur les cellules LIASSE_PLAQUETTE : seulement 'Facturés' = facturation
   *  separee a suivre. */
  type_honos_bilans: string | null;
  /** Tag TVA (vitesse de realisation : Express / Standard / + longue / ...).
   *  Seulement pertinent pour le tracker tva-mensuelle. NULL = pas de tag. */
  tva_tag_id: string | null;
  /** Jour du mois de l'echeance TVA (1..31). NULL = defaut 24.
   *  Sert au calcul du "mois actuel TVA" en vue 3m + pastille echeance proche. */
  tva_echeance_jour: number | null;
  /** Jour de cloture du client (1..31). NULL = inconnu (defaut 31/12). */
  jour_cloture: number | null;
  /** Mois de cloture du client (1..12). NULL = inconnu (defaut 31/12). */
  mois_cloture: number | null;
  cells: TrackerCell[];
};

/** Etiquette TVA configurable par le user via /parametrage/tva-tags. */
export type TvaTag = {
  id: string;
  label: string;
  color: string;
  ordre: number;
  actif: boolean;
};

type StatutFilter = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export default function TrackerTable({
  rows,
  cols,
  year,
  statusOptions,
  focus,
  initialCommentCounts,
  currentUserEmail,
  trackerSlug,
  tvaTags,
}: {
  rows: TrackerRow[];
  /** Exercice affiché : nécessaire pour créer une obligation absente
   *  (cellule "-") directement depuis le tracker. */
  year: number;
  cols: Array<{
    key: string;
    label: string;
    type: string;
    periode: string;
    /** "facturation" = colonne dediee qui rend uniquement la pastille
     *  facturation (a_facturer / facturee / sans_facture). Cf. trackers.ts
     *  pour AGO et LIASSE_PLAQUETTE qui exposent 2 colonnes par annee. */
    kind?: "status" | "facturation";
  }>;
  statusOptions: Record<string, StatusOption[]>;
  focus?: string | null;
  initialCommentCounts: Record<string, number>;
  currentUserEmail: string | null;
  /** Slug du tracker actif. Sert a activer des features specifiques
   *  (ex: vue 3 mois + chips tag pour tva-mensuelle). */
  trackerSlug?: string;
  /** Tags TVA (charge uniquement si trackerSlug === "tva-mensuelle"). */
  tvaTags?: TvaTag[] | null;
}) {
  const isTvaMensuelle = trackerSlug === "tva-mensuelle";
  // Droits effectifs de l'utilisateur (confort visuel : on grise les
  // controles d'ecriture ; la vraie barriere reste cote server actions).
  //  - edit_production : statut d'obligation, bulk, facturation.
  //  - edit_parametrage : etiquette TVA (setClientTvaTag).
  const canEditProduction = useCan("edit_production");
  const canEditParametrage = useCan("edit_parametrage");
  const [search, setSearch] = useState("");
  const [openCellId, setOpenCellId] = useState<string | null>(null);
  const [highlightedCellId, setHighlightedCellId] = useState<string | null>(null);
  // Commentaires : compteur par obligation_id (server-loaded initial, MAJ
  // optimiste via panel). + ID de l'obligation pour laquelle le panel est ouvert.
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    initialCommentCounts ?? {}
  );
  const [openCommentsObligId, setOpenCommentsObligId] = useState<string | null>(null);
  const [openCommentsLabel, setOpenCommentsLabel] = useState<string>("");
  // Rect d'ancrage du popover commentaires (capturé au clic sur 💬)
  const [openCommentsAnchor, setOpenCommentsAnchor] = useState<
    { left: number; top: number; bottom: number; right: number } | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<Set<StatutFilter>>(new Set());
  const [periodFilter, setPeriodFilter] = useState<Set<string>>(new Set());
  // Filtre par mois de cloture du client : utile sur les trackers annuels
  // (Liasse, AGO, Depot, Solde IS, CA12 annuel) ou la date d'echeance depend
  // de la cloture. Set vide = tous.
  const [filterCloture, setFilterCloture] = useState<Set<number>>(new Set());
  // Vue TVA mensuelle : "3m" (mois precedent/actuel/suivant) vs "12m" (annee).
  // Defaut 3m sur tva-mensuelle car c'est l'usage quotidien. Le user toggle
  // vers 12m pour la vue annuelle bilan.
  const [tvaView, setTvaView] = useState<"3m" | "12m">("3m");
  // Filtre par etiquette TVA : id du tag, "all" (defaut), ou "none" (sans tag)
  const [tvaTagFilter, setTvaTagFilter] = useState<string>("all");
  // Tri TVA : "nom" (alphabetique denomination, defaut) ou "etiquette" (par
  // ordre des tva_tags puis denomination en secondaire).
  const [tvaSort, setTvaSort] = useState<"nom" | "etiquette">("nom");
  // Hydratation localStorage : flag pour eviter d'ecrire les defauts dans
  // localStorage avant d'avoir read la valeur stockee. Pattern habituel pour
  // les states persistes en Next.js (SSR-safe).
  const [hydrated, setHydrated] = useState(false);
  // Largeur auto-fit pour les colonnes (sinon min-w-[120px] par défaut)
  const [autoFit, setAutoFit] = useState(false);
  // Sélection multi-cellules (set d'obligationIds)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
  // Presse-papier client en grille (style Excel) :
  // une matrice rows × cols où chaque case est { libelle } ou null si vide.
  type ClipCell = { libelle: string; color: string | null } | null;
  const [clipboard, setClipboard] = useState<{
    grid: ClipCell[][];
    rows: number;
    cols: number;
  } | null>(null);
  const [, startTransition] = useTransition();
  const tableRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Persistance localStorage des prefs UI (vue, tri, filtres) par tracker.
  // Cle scopee `moon.tracker.{slug}.*` pour ne pas melanger les contextes
  // (ex. tva-mensuelle vs ago-depot ont leurs propres prefs).
  //
  // Pattern : on lit au mount dans un useEffect (SSR-safe : pas de mismatch
  // d'hydratation), on ecrit a chaque changement uniquement APRES hydratation
  // (sinon on ecraserait la valeur stockee avec le defaut au premier render).
  const STORAGE_PREFIX = `moon.tracker.${trackerSlug ?? "default"}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const view = localStorage.getItem(`${STORAGE_PREFIX}.tvaView`);
      if (view === "3m" || view === "12m") setTvaView(view);
      const sort = localStorage.getItem(`${STORAGE_PREFIX}.tvaSort`);
      if (sort === "nom" || sort === "etiquette") setTvaSort(sort);
      const tagFilter = localStorage.getItem(`${STORAGE_PREFIX}.tvaTagFilter`);
      if (tagFilter) setTvaTagFilter(tagFilter);
      const status = localStorage.getItem(`${STORAGE_PREFIX}.statusFilter`);
      if (status) {
        const parsed = JSON.parse(status);
        if (Array.isArray(parsed)) setStatusFilter(new Set(parsed as StatutFilter[]));
      }
      const period = localStorage.getItem(`${STORAGE_PREFIX}.periodFilter`);
      if (period) {
        const parsed = JSON.parse(period);
        if (Array.isArray(parsed)) setPeriodFilter(new Set(parsed as string[]));
      }
    } catch {
      // localStorage indispo (mode prive, quota plein) / JSON cassé : on
      // ignore et on reste sur les defauts.
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_PREFIX]);

  // Cleanup : les keys de periodFilter incluent l'annee (ex. "2026-04"). Quand
  // l'user change d'annee, les anciennes keys ne matchent plus aucune col -> on
  // les degage pour eviter un filtre fantome qui cacherait toutes les colonnes.
  useEffect(() => {
    if (!hydrated || periodFilter.size === 0) return;
    const valid = new Set(cols.map((c) => c.key));
    let changed = false;
    const next = new Set<string>();
    for (const k of periodFilter) {
      if (valid.has(k)) next.add(k);
      else changed = true;
    }
    if (changed) setPeriodFilter(next);
  }, [hydrated, cols, periodFilter]);

  // Le tagFilter stocke peut pointer sur un tag supprime depuis. On nettoie
  // si l'id n'existe plus dans la liste actuelle des tags.
  useEffect(() => {
    if (!hydrated || !tvaTags || tvaTagFilter === "all" || tvaTagFilter === "none") return;
    if (!tvaTags.some((t) => t.id === tvaTagFilter)) {
      setTvaTagFilter("all");
    }
  }, [hydrated, tvaTags, tvaTagFilter]);

  // Write : a chaque changement, on persiste. Mais seulement apres hydratation
  // pour ne pas ecraser la valeur stockee avec un defaut au premier render.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}.tvaView`, tvaView);
      localStorage.setItem(`${STORAGE_PREFIX}.tvaSort`, tvaSort);
      localStorage.setItem(`${STORAGE_PREFIX}.tvaTagFilter`, tvaTagFilter);
      localStorage.setItem(`${STORAGE_PREFIX}.statusFilter`, JSON.stringify(Array.from(statusFilter)));
      localStorage.setItem(`${STORAGE_PREFIX}.periodFilter`, JSON.stringify(Array.from(periodFilter)));
    } catch {
      // localStorage saturé : on tant pis, le state React reste correct.
    }
  }, [hydrated, STORAGE_PREFIX, tvaView, tvaSort, tvaTagFilter, statusFilter, periodFilter]);

  // State local + sync via prop. useOptimistic ne joue pas bien avec
  // router.refresh() (revert à la fin de la transition, le refresh n'a pas
  // forcément propagé la donnée serveur). Le state local reste correct et
  // le useEffect re-sync quand les props arrivent.
  type Patch = {
    obligationId: string;
    statut_logique?: StatutLogique;
    statut_detail?: string | null;
    note?: string | null;
    etat_facturation?: EtatFacturation | null;
  };
  const [localRows, setLocalRows] = useState<TrackerRow[]>(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  // Stable (useCallback) pour que les callbacks qui en dépendent (onPick) le
  // restent eux aussi, et que StatusCell mémo continue de fonctionner.
  const applyPatch = useCallback((patch: Patch) => {
    setLocalRows((state) =>
      state.map((r) => ({
        ...r,
        cells: r.cells.map((c) =>
          c.obligationId === patch.obligationId
            ? {
                ...c,
                statut_logique: patch.statut_logique !== undefined ? patch.statut_logique : c.statut_logique,
                statut_detail: patch.statut_detail !== undefined ? patch.statut_detail : c.statut_detail,
                note: patch.note !== undefined ? patch.note : c.note,
                etat_facturation: patch.etat_facturation !== undefined ? patch.etat_facturation : c.etat_facturation,
              }
            : c
        ),
      }))
    );
  }, []);

  /**
   * Patch d'une cellule identifiée par (client, colonne) et non par
   * obligationId : indispensable pour les cellules VIDES ("-"), qui n'ont
   * pas encore de ligne en base. Sert aussi à injecter l'obligationId
   * fraîchement créé une fois l'insert revenu du serveur.
   */
  const applyCellPatch = useCallback(
    (clientId: string, colKey: string, patch: Partial<TrackerCell>) => {
      setLocalRows((state) =>
        state.map((r) =>
          r.clientId !== clientId
            ? r
            : { ...r, cells: r.cells.map((c) => (c.colKey === colKey ? { ...c, ...patch } : c)) }
        )
      );
    },
    []
  );

  // Résolution du focus (`clientId_TYPE_periode`) -> cellId (`clientId|colKey`)
  useEffect(() => {
    if (!focus) return;
    const parts = focus.split("_");
    if (parts.length < 3) return;
    const clientId = parts[0];
    // Le type peut contenir des underscores (TVA_MENSUELLE), donc on
    // récupère la dernière partie comme periode et le milieu comme type.
    // Cas simples : periode contient un tiret (YYYY-MM, T1-YYYY, A-MM-YYYY,
    // S-YYYY). On scinde au dernier underscore qui sépare type/periode.
    const lastUnderscore = focus.lastIndexOf("_");
    const periode = focus.slice(lastUnderscore + 1);
    const type = focus.slice(clientId.length + 1, lastUnderscore);

    // Cherche la colonne dont (type, periode) match
    const col = cols.find((c) => c.type === type && c.periode === periode);
    if (!col) return;
    const cellId = `${clientId}|${col.key}`;
    setOpenCellId(cellId);
    setHighlightedCellId(cellId);
    // Scroll into view après le render
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    });
    // Retire le highlight apres 6s. Plus long que 3.5s (la cellule
    // doit rester reperable le temps que l'utilisateur la voie -
    // surtout quand on vient d'un toast Jarvis).
    const t = setTimeout(() => setHighlightedCellId(null), 6000);
    return () => clearTimeout(t);
  }, [focus, cols]);

  // Trio de periodes TVA (precedent / actuel / suivant) calcule d'apres
  // l'echeance par defaut (24 du mois suivant). Le "mois actuel" est celui
  // dont l'echeance n'est PAS encore depassee.
  //   - Aujourd'hui 20/05 (jour 20 <= 24) -> mois actuel = avril
  //   - Aujourd'hui 25/05 (jour 25 > 24)  -> mois actuel = mai
  // Le jour d'echeance par client (tva_echeance_jour) sert pour la pastille
  // par ligne ; le trio global utilise 24 comme valeur de reference.
  const tvaPeriodes3m = useMemo(() => {
    if (!isTvaMensuelle) return null;
    const ECHEANCE_DEFAULT = 24;
    const today = new Date();
    const baseYear = today.getDate() > ECHEANCE_DEFAULT ? today.getFullYear() : (today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear());
    const baseMonth = today.getDate() > ECHEANCE_DEFAULT ? today.getMonth() : today.getMonth() - 1; // 0..11 ; -1 = decembre N-1
    const pad = (n: number) => String(n).padStart(2, "0");
    // Decale pour gerer le passage d'annee (decembre -> janvier)
    function periodeAt(deltaMonths: number): string {
      const d = new Date(baseYear, baseMonth + deltaMonths, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    return {
      precedent: periodeAt(-1),
      actuel: periodeAt(0),
      suivant: periodeAt(1),
    };
  }, [isTvaMensuelle]);

  // Colonnes visibles d'après :
  //  - le filtre période (vide = toutes), commun a tous les trackers
  //  - + en plus, sur tva-mensuelle en vue 3m : on garde uniquement les 3
  //    periodes precedent/actuel/suivant. Note : si tvaPeriodes3m vise une
  //    annee != year affichee, les cols ne matchent pas et la vue 3m est vide
  //    (cas attendu : on est en 2026 mais l'user regarde 2024 -> 12m sinon vide).
  const visibleCols = useMemo(() => {
    let next = periodFilter.size > 0 ? cols.filter((c) => periodFilter.has(c.key)) : cols;
    if (isTvaMensuelle && tvaView === "3m" && tvaPeriodes3m) {
      const wanted = new Set([tvaPeriodes3m.precedent, tvaPeriodes3m.actuel, tvaPeriodes3m.suivant]);
      next = next.filter((c) => wanted.has(c.periode));
    }
    return next;
  }, [cols, periodFilter, isTvaMensuelle, tvaView, tvaPeriodes3m]);

  // Set pour lookups O(1) sur les colKey visibles. Évite des
  // `visibleCols.some(vc => vc.key === c.colKey)` répétés (O(n²) sur 790 cells).
  const visibleColKeysSet = useMemo(
    () => new Set(visibleCols.map((c) => c.key)),
    [visibleCols]
  );

  // Map colKey -> col pour lookups O(1). Avant : 3× cols.find() PAR cellule
  // (~960 cellules) à chaque render → O(cells × cols). Maintenant O(1).
  const colByKey = useMemo(() => {
    const m = new Map<string, (typeof cols)[number]>();
    for (const c of cols) m.set(c.key, c);
    return m;
  }, [cols]);

  // Map id tag -> ordre, pour tri par etiquette. Tags sans ordre (ou tag null
  // sur une row) finissent en fin de liste via une valeur sentinelle elevee.
  const tvaTagOrderMap = useMemo(() => {
    if (!isTvaMensuelle || !tvaTags) return null;
    const m = new Map<string, number>();
    for (const t of tvaTags) m.set(t.id, t.ordre);
    return m;
  }, [isTvaMensuelle, tvaTags]);

  // Trackers "annuels a cloture" : Liasse, AGO, Depot, Solde IS, CA12 annuel.
  // Sur ces trackers on affiche une colonne "Echeance" (apres le nom client)
  // et on permet de filtrer par mois de cloture.
  const CLOTURE_BASED_TYPES = useMemo(() => new Set([
    "IS_SOLDE", "LIASSE_PLAQUETTE", "COMPTA",
    "AGO_DEPOT", "DEPOT_COMPTES",
    "TVA_ANNUELLE_CA12",
  ]), []);
  const MOIS_FR = useMemo(() => [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sept", "Oct", "Nov", "Déc"
  ], []);
  const hasClotureBasedCols = useMemo(
    () => cols.some((c) => CLOTURE_BASED_TYPES.has(c.type)),
    [cols, CLOTURE_BASED_TYPES]
  );

  // Calcule la prochaine echeance pour une row donnee (la plus proche parmi
  // les cellules cloture-based non terminees). null = pas d'echeance.
  function computeNextEcheance(r: TrackerRow): Date | null {
    const cloture = (r.jour_cloture && r.mois_cloture)
      ? { jour: r.jour_cloture, mois: r.mois_cloture }
      : { jour: 31, mois: 12 };
    let earliest: Date | null = null;
    for (const c of r.cells) {
      if (!CLOTURE_BASED_TYPES.has(c.type)) continue;
      if (c.statut_logique === "TERMINE" || c.statut_logique === "NON_APPLICABLE") continue;
      const col = cols.find((co) => co.key === c.colKey);
      if (!col) continue;
      const anneePeriode = extractAnneeFromPeriode(col.periode);
      if (anneePeriode === null) continue;
      const ech = computeEcheance(c.type, col.periode, anneePeriode, cloture);
      if (!ech) continue;
      if (!earliest || ech.dueDate < earliest) earliest = ech.dueDate;
    }
    return earliest;
  }

  // Liste dynamique des mois de cloture presents dans les clients (pour
  // generer les chips filter). Trie : decembre + mois civils.
  const clotureMoisPresents = useMemo(() => {
    const s = new Set<number>();
    for (const r of localRows) {
      if (r.mois_cloture) s.add(r.mois_cloture);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [localRows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const hasStatusFilter = statusFilter.size > 0;
    const out = localRows.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      // Filtre statut : au moins une cellule visible (= dans visibleColKeysSet)
      // remplie correspond
      if (hasStatusFilter) {
        const has = r.cells.some(
          (c) =>
            c.obligationId &&
            c.statut_logique &&
            visibleColKeysSet.has(c.colKey) &&
            statusFilter.has(c.statut_logique as StatutFilter)
        );
        if (!has) return false;
      }
      // Filtre tag TVA (uniquement sur tva-mensuelle)
      if (isTvaMensuelle && tvaTagFilter !== "all") {
        if (tvaTagFilter === "none") {
          if (r.tva_tag_id !== null) return false;
        } else {
          if (r.tva_tag_id !== tvaTagFilter) return false;
        }
      }
      // Filtre par mois de cloture (uniquement sur trackers cloture-based)
      if (hasClotureBasedCols && filterCloture.size > 0) {
        if (!r.mois_cloture || !filterCloture.has(r.mois_cloture)) return false;
      }
      return true;
    });
    // Tri TVA par etiquette : groupe par ordre du tag puis alphabetique
    // denomination. Les rows sans tag terminent en fin de liste.
    if (isTvaMensuelle && tvaSort === "etiquette" && tvaTagOrderMap) {
      const SANS_TAG_ORDRE = Number.MAX_SAFE_INTEGER;
      out.sort((a, b) => {
        const oa = a.tva_tag_id ? tvaTagOrderMap.get(a.tva_tag_id) ?? SANS_TAG_ORDRE : SANS_TAG_ORDRE;
        const ob = b.tva_tag_id ? tvaTagOrderMap.get(b.tva_tag_id) ?? SANS_TAG_ORDRE : SANS_TAG_ORDRE;
        if (oa !== ob) return oa - ob;
        return a.denomination.localeCompare(b.denomination, "fr");
      });
    }
    // Tri par echeance croissante sur les trackers cloture-based : la plus
    // proche / la plus urgente en haut. denomination en tri secondaire.
    if (hasClotureBasedCols) {
      const FAR_FUTURE = Number.MAX_SAFE_INTEGER;
      out.sort((a, b) => {
        const da = computeNextEcheance(a)?.getTime() ?? FAR_FUTURE;
        const db = computeNextEcheance(b)?.getTime() ?? FAR_FUTURE;
        if (da !== db) return da - db;
        return a.denomination.localeCompare(b.denomination, "fr");
      });
    }
    // (sinon : on garde le tri par denomination defini par le server cote page.tsx)
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRows, search, statusFilter, visibleColKeysSet, isTvaMensuelle, tvaTagFilter, tvaSort, tvaTagOrderMap, hasClotureBasedCols, filterCloture, cols]);

  // Compteurs par tag TVA pour les chips (independants du filtre tag courant)
  const tvaTagCounts = useMemo(() => {
    if (!isTvaMensuelle) return null;
    const byTag = new Map<string, number>();
    let none = 0;
    for (const r of localRows) {
      if (r.tva_tag_id) byTag.set(r.tva_tag_id, (byTag.get(r.tva_tag_id) ?? 0) + 1);
      else none++;
    }
    return { byTag, none, total: localRows.length };
  }, [localRows, isTvaMensuelle]);

  // Bornes nav (déclarées tôt pour être dispo dans tous les hooks/handlers)
  const maxRow = filtered.length - 1;
  const maxCol = visibleCols.length - 1;

  // Pattern uniforme : clic simple = single-select (remplace), Cmd/Ctrl+clic = toggle.
  // Coherent avec IR / CAA / Creations / Missions exc / Pilotage.
  function handleStatusFilter(s: StatutFilter, e?: React.MouseEvent) {
    setStatusFilter((prev) => toggleFilterKey(prev, s, e));
  }

  // Récupère l'obligationId d'une cellule (row, col)
  function obligationIdAt(row: number, col: number): string | null {
    const td = tableRef.current?.querySelector<HTMLElement>(
      `td[data-row-index="${row}"][data-col-index="${col}"]`
    );
    return td?.dataset.obligationId ?? null;
  }

  // Sélectionne une plage rectangulaire (ancre -> (row, col))
  function selectRange(toRow: number, toCol: number) {
    if (!anchor) return;
    const rMin = Math.min(anchor.row, toRow);
    const rMax = Math.max(anchor.row, toRow);
    const cMin = Math.min(anchor.col, toCol);
    const cMax = Math.max(anchor.col, toCol);
    const next = new Set<string>();
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const id = obligationIdAt(r, c);
        if (id) next.add(id);
      }
    }
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAnchor(null);
  }

  // Sélection ligne entière
  function selectRow(rowIndex: number, e?: React.MouseEvent) {
    const ids: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const id = obligationIdAt(rowIndex, c);
      if (id) ids.push(id);
    }
    if (e?.metaKey || e?.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    } else if (e?.shiftKey && anchor) {
      // Étend la sélection actuelle pour englober [anchor.row .. rowIndex]
      const rMin = Math.min(anchor.row, rowIndex);
      const rMax = Math.max(anchor.row, rowIndex);
      const next = new Set<string>();
      for (let r = rMin; r <= rMax; r++) {
        for (let c = 0; c <= maxCol; c++) {
          const id = obligationIdAt(r, c);
          if (id) next.add(id);
        }
      }
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set(ids));
      setAnchor({ row: rowIndex, col: 0 });
    }
  }

  // Sélection colonne entière
  function selectColumn(colIndex: number, e?: React.MouseEvent) {
    const ids: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const id = obligationIdAt(r, colIndex);
      if (id) ids.push(id);
    }
    if (e?.metaKey || e?.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    } else if (e?.shiftKey && anchor) {
      const cMin = Math.min(anchor.col, colIndex);
      const cMax = Math.max(anchor.col, colIndex);
      const next = new Set<string>();
      for (let r = 0; r <= maxRow; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const id = obligationIdAt(r, c);
          if (id) next.add(id);
        }
      }
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set(ids));
      setAnchor({ row: 0, col: colIndex });
    }
  }

  // Donne la liste des cellules visibles d'une ligne (post-filtre période)
  function visibleCellsOf(rowIndex: number) {
    const r = filtered[rowIndex];
    if (!r) return [];
    return r.cells.filter((c) => visibleColKeysSet.has(c.colKey));
  }

  // Capture la sélection courante sous forme de grille (style Excel)
  function buildClipboardGrid(): { grid: ClipCell[][]; rows: number; cols: number } | null {
    if (selectedIds.size === 0) return null;
    let minRow = Infinity, maxR = -Infinity, minCol = Infinity, maxC = -Infinity;
    filtered.forEach((row, rowIndex) => {
      const visCells = row.cells.filter((cc) => visibleColKeysSet.has(cc.colKey));
      visCells.forEach((cell, colIndex) => {
        if (cell.obligationId && selectedIds.has(cell.obligationId)) {
          if (rowIndex < minRow) minRow = rowIndex;
          if (rowIndex > maxR) maxR = rowIndex;
          if (colIndex < minCol) minCol = colIndex;
          if (colIndex > maxC) maxC = colIndex;
        }
      });
    });
    if (minRow === Infinity) return null;
    const grid: ClipCell[][] = [];
    for (let r = minRow; r <= maxR; r++) {
      const line: ClipCell[] = [];
      const visCells = visibleCellsOf(r);
      for (let c = minCol; c <= maxC; c++) {
        const cell = visCells[c];
        if (cell?.obligationId && selectedIds.has(cell.obligationId) && cell.statut_detail) {
          const opt = (statusOptions[cell.type] ?? []).find((o) => o.libelle === cell.statut_detail);
          line.push({ libelle: cell.statut_detail, color: opt?.color ?? null });
        } else {
          line.push(null);
        }
      }
      grid.push(line);
    }
    return { grid, rows: maxR - minRow + 1, cols: maxC - minCol + 1 };
  }

  // Colle la grille du clipboard à partir d'une cellule ancre (anchorRow, anchorCol).
  // Cas particulier : si la grille est 1×1 ET qu'il y a plusieurs cellules
  // sélectionnées → colle la même valeur sur TOUTES les cellules sélectionnées
  // (comportement Excel "1 cellule → plusieurs"). Sinon, paste positionnel.
  function pasteClipboardAt(anchorRow: number, anchorCol: number) {
    if (!clipboard) return;
    // Lecture seule : le coller est une mutation -> on bloque + toast.
    if (!canEditProduction) {
      toastError("Droit d'édition requis pour coller des statuts.");
      return;
    }
    const byLibelle = new Map<string, { ids: string[]; statut_logique: StatutLogique }>();

    const isSingleCell = clipboard.rows === 1 && clipboard.cols === 1;
    const single = isSingleCell ? clipboard.grid[0][0] : null;

    if (single && selectedIds.size > 1) {
      // Fill-all : applique la valeur à toutes les cellules sélectionnées
      for (const r of filtered) {
        for (const cc of r.cells) {
          if (!cc.obligationId || !selectedIds.has(cc.obligationId)) continue;
          const opt = (statusOptions[cc.type] ?? []).find((o) => o.libelle === single.libelle);
          if (!opt) continue;
          const e = byLibelle.get(single.libelle) ?? {
            ids: [],
            statut_logique: opt.statut_logique as StatutLogique,
          };
          e.ids.push(cc.obligationId);
          byLibelle.set(single.libelle, e);
        }
      }
    } else {
      // Paste positionnel (grille N×M depuis l'ancre)
      for (let r = 0; r < clipboard.rows; r++) {
        for (let c = 0; c < clipboard.cols; c++) {
          const v = clipboard.grid[r][c];
          if (!v) continue;
          const targetRow = anchorRow + r;
          const targetCol = anchorCol + c;
          if (targetRow > maxRow || targetCol > maxCol) continue;
          const visCells = visibleCellsOf(targetRow);
          const tc = visCells[targetCol];
          if (!tc?.obligationId) continue;
          const opt = (statusOptions[tc.type] ?? []).find((o) => o.libelle === v.libelle);
          if (!opt) continue;
          const e = byLibelle.get(v.libelle) ?? {
            ids: [],
            statut_logique: opt.statut_logique as StatutLogique,
          };
          e.ids.push(tc.obligationId);
          byLibelle.set(v.libelle, e);
        }
      }
    }

    if (byLibelle.size === 0) return;
    // Patch local immédiat (hors transition pour ne pas être perdu)
    for (const [libelle, { ids, statut_logique }] of byLibelle) {
      for (const id of ids) {
        applyPatch({ obligationId: id, statut_logique, statut_detail: libelle });
      }
    }
    startTransition(async () => {
      // Server : 1 appel par libellé
      await Promise.all(
        [...byLibelle].map(([libelle, { ids }]) =>
          bulkUpdateObligationStatus(ids, libelle)
        )
      );
      router.refresh();
    });
  }

  // Construit un TSV de la sélection (collable dans Excel)
  function buildSelectionTsv(): string {
    if (selectedIds.size === 0) return "";
    let minRow = Infinity, maxR = -Infinity, minCol = Infinity, maxC = -Infinity;
    filtered.forEach((row, rowIndex) => {
      const visCells = row.cells.filter((cc) => visibleColKeysSet.has(cc.colKey));
      visCells.forEach((cell, colIndex) => {
        if (cell.obligationId && selectedIds.has(cell.obligationId)) {
          if (rowIndex < minRow) minRow = rowIndex;
          if (rowIndex > maxR) maxR = rowIndex;
          if (colIndex < minCol) minCol = colIndex;
          if (colIndex > maxC) maxC = colIndex;
        }
      });
    });
    if (minRow === Infinity) return "";
    const lines: string[][] = [];
    const header: string[] = ["Client"];
    for (let c = minCol; c <= maxC; c++) header.push(visibleCols[c]?.label ?? "");
    lines.push(header);
    for (let r = minRow; r <= maxR; r++) {
      const row = filtered[r];
      const visCells = row.cells.filter((cc) => visibleColKeysSet.has(cc.colKey));
      const rowData: string[] = [row.denomination];
      for (let c = minCol; c <= maxC; c++) {
        const cell = visCells[c];
        const inSel = !!cell?.obligationId && selectedIds.has(cell.obligationId);
        rowData.push(inSel ? cell?.statut_detail ?? "" : "");
      }
      lines.push(rowData);
    }
    return lines.map((l) => l.join("\t")).join("\n");
  }

  // Coordonnées (row|col) des cellules sélectionnées - pour dessiner un seul
  // contour englobant à la Excel (au lieu d'un ring par cellule).
  const selectedCoords = useMemo(() => {
    const s = new Set<string>();
    filtered.forEach((row, rowIndex) => {
      const cells = row.cells.filter((c) => visibleColKeysSet.has(c.colKey));
      cells.forEach((cell, colIndex) => {
        if (cell.obligationId && selectedIds.has(cell.obligationId)) {
          s.add(`${rowIndex}|${colIndex}`);
        }
      });
    });
    return s;
  }, [filtered, visibleColKeysSet, selectedIds]);

  function selectAll() {
    const all = new Set<string>();
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const id = obligationIdAt(r, c);
        if (id) all.add(id);
      }
    }
    setSelectedIds(all);
  }

  // Raccourcis globaux (Escape, Cmd+Shift+L, Cmd+A, Cmd+C, Cmd+V) - fonctionnent
  // même si le focus n'est pas sur une cellule.
  useEffect(() => {
    function onWindowKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Ne pas intercepter si on est dans un input/textarea/select
      const isInput = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );

      if (e.key === "Escape" && selectedIds.size > 0 && !openCellId) {
        clearSelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setSearch("");
        setStatusFilter(new Set());
        setPeriodFilter(new Set());
        return;
      }
      // Cmd/Ctrl+A : sélectionne tout, sauf si focus dans un input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !openCellId && !isInput) {
        e.preventDefault();
        const all = new Set<string>();
        for (let r = 0; r <= maxRow; r++) {
          for (let c = 0; c <= maxCol; c++) {
            const id = obligationIdAt(r, c);
            if (id) all.add(id);
          }
        }
        setSelectedIds(all);
        return;
      }
      // Cmd/Ctrl+C : copie la sélection (TSV + grille interne)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !openCellId && !isInput && selectedIds.size > 0) {
        e.preventDefault();
        const g = buildClipboardGrid();
        if (g) setClipboard(g);
        const tsv = buildSelectionTsv();
        if (tsv) navigator.clipboard?.writeText(tsv).catch(() => {});
        return;
      }
      // Cmd/Ctrl+V : colle la grille à partir de l'ancre courante (ou 1ère cellule sélectionnée)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !openCellId && !isInput && clipboard) {
        e.preventDefault();
        // Anchor = première cellule sélectionnée
        let anchorRow = -1;
        let anchorCol = -1;
        filtered.forEach((row, rowIndex) => {
          const visCells = visibleCellsOf(rowIndex);
          visCells.forEach((cell, colIndex) => {
            if (cell.obligationId && selectedIds.has(cell.obligationId)) {
              if (anchorRow === -1 || rowIndex < anchorRow || (rowIndex === anchorRow && colIndex < anchorCol)) {
                anchorRow = rowIndex;
                anchorCol = colIndex;
              }
            }
          });
        });
        if (anchorRow !== -1) pasteClipboardAt(anchorRow, anchorCol);
        return;
      }
    }
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, openCellId, clipboard, filtered, visibleCols]);

  // Navigation Excel-like : flèches déplacent le focus, Shift+Flèche étend la
  // sélection, Cmd+Shift+Flèche file au bord. Enter/Espace ouvre le picker,
  // Esc ferme et vide la sélection. Cmd+C copie le statut, Cmd+V colle.
  function onTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Escape global : vide la sélection (le picker se ferme déjà via StatusCell)
    if (e.key === "Escape" && selectedIds.size > 0 && !openCellId) {
      e.preventDefault();
      clearSelection();
      return;
    }

    // Cmd/Ctrl+A : sélectionne toutes les cellules visibles
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !openCellId) {
      e.preventDefault();
      const all = new Set<string>();
      for (let r = 0; r <= maxRow; r++) {
        for (let c = 0; c <= maxCol; c++) {
          const id = obligationIdAt(r, c);
          if (id) all.add(id);
        }
      }
      setSelectedIds(all);
      return;
    }

    if (openCellId) return;
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("button[data-cell-button]");
    if (!btn) return;
    const td = btn.closest<HTMLElement>("td[data-row-index]");
    if (!td) return;
    const row = parseInt(td.dataset.rowIndex || "0", 10);
    const col = parseInt(td.dataset.colIndex || "0", 10);

    // Cmd/Ctrl+C : copie la sélection comme grille (style Excel)
    //  - clipboard interne = grille structurée pour Coller positionnel
    //  - clipboard OS = TSV pour coller dans Excel
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      if (selectedIds.size > 0) {
        const g = buildClipboardGrid();
        if (g) setClipboard(g);
        const tsv = buildSelectionTsv();
        if (tsv) navigator.clipboard?.writeText(tsv).catch(() => {});
      } else {
        // Pas de sélection : copie la cellule focusée (1×1)
        const visCells = visibleCellsOf(row);
        const c = visCells[col];
        if (c?.statut_detail) {
          const opt = (statusOptions[c.type] ?? []).find((o) => o.libelle === c.statut_detail);
          setClipboard({
            grid: [[{ libelle: c.statut_detail, color: opt?.color ?? null }]],
            rows: 1,
            cols: 1,
          });
          navigator.clipboard?.writeText(c.statut_detail).catch(() => {});
        }
      }
      return;
    }

    // Cmd/Ctrl+V : colle la GRILLE à partir de la cellule focusée (top-left).
    // Si la grille est 3×4, on remplit 3 lignes × 4 colonnes vers le bas-droite.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
      if (!clipboard) return;
      e.preventDefault();
      pasteClipboardAt(row, col);
      return;
    }

    // Flèches : navigation / extension de sélection
    let nextRow = row;
    let nextCol = col;
    let toEdge = false;
    switch (e.key) {
      case "ArrowLeft":  nextCol -= 1; break;
      case "ArrowRight": nextCol += 1; break;
      case "ArrowUp":    nextRow -= 1; break;
      case "ArrowDown":  nextRow += 1; break;
      default: return;
    }
    if (e.metaKey || e.ctrlKey) toEdge = true;
    if (toEdge) {
      if (e.key === "ArrowLeft") nextCol = 0;
      else if (e.key === "ArrowRight") nextCol = maxCol;
      else if (e.key === "ArrowUp") nextRow = 0;
      else if (e.key === "ArrowDown") nextRow = maxRow;
    }
    nextRow = Math.max(0, Math.min(maxRow, nextRow));
    nextCol = Math.max(0, Math.min(maxCol, nextCol));

    e.preventDefault();

    if (e.shiftKey) {
      // Étend la sélection depuis l'ancre vers (nextRow, nextCol)
      if (!anchor) setAnchor({ row, col });
      const anchorRow = anchor?.row ?? row;
      const anchorCol = anchor?.col ?? col;
      const rMin = Math.min(anchorRow, nextRow);
      const rMax = Math.max(anchorRow, nextRow);
      const cMin = Math.min(anchorCol, nextCol);
      const cMax = Math.max(anchorCol, nextCol);
      const next = new Set<string>();
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const id = obligationIdAt(r, c);
          if (id) next.add(id);
        }
      }
      setSelectedIds(next);
    } else {
      // Pas de Shift : on vide la sélection multi-cellules (comportement Excel)
      // et l'ancre devient la nouvelle cellule focusée
      if (selectedIds.size > 0) setSelectedIds(new Set());
      setAnchor({ row: nextRow, col: nextCol });
    }

    // Toujours déplacer le focus
    const nextEl = tableRef.current?.querySelector<HTMLElement>(
      `td[data-row-index="${nextRow}"][data-col-index="${nextCol}"] button[data-cell-button]`
    );
    nextEl?.focus();
  }

  function onCellMouseDown(
    e: React.MouseEvent,
    obligationId: string | null,
    row: number,
    col: number
  ) {
    if (!obligationId) return;
    if (e.shiftKey) {
      e.preventDefault();
      if (!anchor) setAnchor({ row, col });
      selectRange(row, col);
    } else if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(obligationId)) next.delete(obligationId);
        else next.add(obligationId);
        return next;
      });
      setAnchor({ row, col });
    } else {
      // Plain click : on garde l'ancre mais on ne touche pas à la sélection ;
      // le onClick ouvrira le picker. Si une sélection existe, on la vide
      // pour éviter la confusion.
      setAnchor({ row, col });
      if (selectedIds.size > 0) setSelectedIds(new Set());
    }
  }

  // Bulk action : applique un libellé (ou null = reset) à la sélection
  function runBulk(obligationIds: string[], libelle: string | null) {
    if (obligationIds.length === 0) return;
    // Lecture seule : on bloque la mutation groupee + toast (les boutons
    // de la barre d'action sont deja grises, ceci est une securite).
    if (!canEditProduction) {
      toastError("Droit d'édition requis pour modifier les statuts.");
      return;
    }
    // Optimistic : applique le patch à chaque cellule. Pour libelle=null on
    // ne sait pas le défaut par type, on laisse le serveur trancher (on
    // affichera A_FAIRE/statut_detail à null en attendant).
    // Patch local immédiat
    for (const oid of obligationIds) {
      let statut_logique: StatutLogique = "A_FAIRE";
      if (libelle) {
        for (const r of filtered) {
          const c = r.cells.find((cc) => cc.obligationId === oid);
          if (c) {
            const opt = (statusOptions[c.type] ?? []).find((o) => o.libelle === libelle);
            if (opt) statut_logique = opt.statut_logique;
            break;
          }
        }
      }
      applyPatch({ obligationId: oid, statut_logique, statut_detail: libelle });
    }
    startTransition(async () => {
      try {
        await bulkUpdateObligationStatus(obligationIds, libelle);
        toastSuccess(
          `${obligationIds.length} cellule${obligationIds.length > 1 ? "s" : ""} mise${obligationIds.length > 1 ? "s" : ""} à jour`
        );
      } catch (e) {
        toastError(e, "Échec mise à jour groupée");
      } finally {
        // Refresh dans tous les cas : rollback optimistic si erreur, sync si OK
        router.refresh();
      }
    });
  }

  // Toutes les options de statut concaténées (uniques par libellé) pour le
  // bulk picker. Si plusieurs types ont le même libellé, on garde le premier.
  const allStatusOptions: StatusOption[] = useMemo(() => {
    const seen = new Map<string, StatusOption>();
    for (const opts of Object.values(statusOptions)) {
      for (const o of opts) {
        if (!seen.has(o.libelle)) seen.set(o.libelle, o);
      }
    }
    return [...seen.values()];
  }, [statusOptions]);

  // Pattern uniforme : clic = single (remplace), Cmd/Ctrl+clic = toggle.
  // Coherent avec les chips de statut, IR/CAA/Creations/Mission exc/Pilotage.
  function togglePeriodFilter(key: string, e?: React.MouseEvent) {
    setPeriodFilter((prev) => toggleFilterKey(prev, key, e));
  }

  const colStats = useMemo(() => {
    const stats: Record<string, { total: number; done: number }> = {};
    for (const col of visibleCols) stats[col.key] = { total: 0, done: 0 };
    for (const r of filtered) {
      for (const c of r.cells) {
        if (!c.obligationId) continue;
        if (!stats[c.colKey]) continue;
        stats[c.colKey].total++;
        if (c.statut_logique === "TERMINE" || c.statut_logique === "NON_APPLICABLE") {
          stats[c.colKey].done++;
        }
      }
    }
    return stats;
  }, [filtered, visibleCols]);

  // Callbacks stables (useCallback) pour que StatusCell mémo ne se re-render
  // pas inutilement. Ils prennent obligationId/type en paramètres au lieu
  // d'être créés en closure à chaque cellule.
  const onPick = useCallback(
    (obligationId: string | null, libelle: string, type: string, clientId: string, colKey: string) => {
      if (!canEditProduction) {
        toastError("Droit d'édition requis pour modifier ce statut.");
        return;
      }
      // Cellule VIDE ("-") : aucune ligne en base. On la crée à la volée avec
      // le statut choisi (même mécanique que les échéances virtuelles de
      // /obligations), puis on récupère l'id retourné pour que les clics
      // suivants passent par un simple update.
      if (!obligationId) {
        const meta = colByKey.get(colKey);
        if (!meta) return;
        const optNew = (statusOptions[type] ?? []).find((o) => o.libelle === libelle);
        applyCellPatch(clientId, colKey, {
          statut_logique: (optNew?.statut_logique as StatutLogique) ?? "A_FAIRE",
          statut_detail: libelle,
        });
        setOpenCellId(null);
        startTransition(async () => {
          try {
            const { obligationId: newId } = await setEcheanceStatus(
              { obligationId: null, clientId, type, periode: meta.periode, annee: year },
              libelle
            );
            applyCellPatch(clientId, colKey, { obligationId: newId });
          } catch (e) {
            toastError(e, "Échec de création de l'obligation");
          } finally {
            router.refresh();
          }
        });
        return;
      }
      const opts = statusOptions[type] ?? [];
      const opt = opts.find((o) => o.libelle === libelle);
      const newStatutLogique = (opt?.statut_logique as StatutLogique) ?? "A_FAIRE";
      const patch: Patch = {
        obligationId,
        statut_logique: newStatutLogique,
        statut_detail: libelle,
      };
      // Auto-facturation : passage en TERMINE sur AGO/Bilan + facturation null
      // -> "a_facturer". Cf. trigger DB auto_facturation_on_termine_obligations.
      // Cote optimistic : recherche la cell actuelle pour ne pas ecraser une valeur
      // explicite que le user aurait deja choisie.
      if (newStatutLogique === "TERMINE" && (type === "AGO_DEPOT" || type === "LIASSE_PLAQUETTE")) {
        let currentEtatFact: EtatFacturation | null | undefined;
        for (const r of filtered) {
          const found = r.cells.find((c) => c.obligationId === obligationId);
          if (found) {
            currentEtatFact = found.etat_facturation;
            break;
          }
        }
        if (!currentEtatFact) {
          patch.etat_facturation = "a_facturer";
        }
      }
      applyPatch(patch);
      setOpenCellId(null);
      startTransition(async () => {
        try {
          await updateObligationStatus(obligationId, libelle);
        } catch (e) {
          toastError(e, "Échec mise à jour");
        } finally {
          router.refresh();
        }
      });
    },
    [statusOptions, applyPatch, applyCellPatch, colByKey, year, router, filtered, visibleCols, canEditProduction]
  );

  const onReset = useCallback(
    (obligationId: string) => {
      if (!canEditProduction) {
        toastError("Droit d'édition requis pour réinitialiser ce statut.");
        return;
      }
      applyPatch({ obligationId, statut_logique: "A_FAIRE", statut_detail: null });
      setOpenCellId(null);
      startTransition(async () => {
        try {
          await updateObligationStatus(obligationId, null);
        } catch (e) {
          toastError(e, "Échec réinitialisation");
        } finally {
          router.refresh();
        }
      });
    },
    [applyPatch, router, canEditProduction]
  );

  // Facturation juridique (AGO_DEPOT) ou bilan (LIASSE_PLAQUETTE) : 2e pastille
  // sous la cellule. Optimistic update + persist async + try/catch pour ne pas
  // crasher la page si l'ecriture echoue (ex: migration 0050 pas encore
  // appliquee, RLS, etc.). En cas d'erreur on revert via router.refresh().
  const onSetFactStable = useCallback(
    (obligationId: string, etat: EtatFacturation | null) => {
      if (!canEditProduction) {
        toastError("Droit d'édition requis pour modifier la facturation.");
        return;
      }
      applyPatch({ obligationId, etat_facturation: etat });
      startTransition(async () => {
        try {
          await setObligationFacturation(obligationId, etat);
          router.refresh();
        } catch (e) {
          toastError(e, "Echec sauvegarde facturation");
          router.refresh();
        }
      });
    },
    [applyPatch, router, canEditProduction]
  );

  // (Le système de notes legacy est remplacé par les commentaires latéraux.)

  // Stables : ouverture/fermeture du picker. StatusCell les appelle avec
  // son propre cellId en paramètre.
  const handleOpen = useCallback((cellId: string) => setOpenCellId(cellId), []);
  const handleClose = useCallback(() => setOpenCellId(null), []);

  // Changement d'etiquette TVA inline (depuis le tracker tva-mensuelle).
  // Optimistic update sur localRows + persist async + revert si erreur.
  const onChangeTvaTag = useCallback(
    (clientId: string, tagId: string | null) => {
      // L'etiquette TVA releve du parametrage, pas de la production.
      if (!canEditParametrage) {
        toastError("Droit de paramétrage requis pour modifier l'étiquette.");
        return;
      }
      const previous = localRows.find((r) => r.clientId === clientId)?.tva_tag_id ?? null;
      setLocalRows((state) =>
        state.map((r) => (r.clientId === clientId ? { ...r, tva_tag_id: tagId } : r))
      );
      startTransition(async () => {
        try {
          await setClientTvaTag(clientId, tagId);
          router.refresh();
        } catch (e) {
          toastError(e, "Échec sauvegarde étiquette");
          // Revert
          setLocalRows((state) =>
            state.map((r) => (r.clientId === clientId ? { ...r, tva_tag_id: previous } : r))
          );
        }
      });
    },
    [localRows, router, canEditParametrage]
  );

  // Ouverture du popover commentaires (depuis l'icône 💬 d'une cellule).
  // Capture le rect de l'élément cliqué pour ancrer le popover.
  const handleOpenComments = useCallback(
    (
      obligationId: string,
      label: string,
      anchorRect: { left: number; top: number; bottom: number; right: number }
    ) => {
      setOpenCommentsObligId(obligationId);
      setOpenCommentsLabel(label);
      setOpenCommentsAnchor(anchorRect);
      // Si le picker statut est ouvert, on le ferme pour ne pas avoir 2 popovers.
      setOpenCellId(null);
    },
    []
  );

  const handleCloseComments = useCallback(() => {
    setOpenCommentsObligId(null);
    setOpenCommentsAnchor(null);
  }, []);

  const handleCommentCountChange = useCallback(
    (obligationId: string, count: number) => {
      setCommentCounts((prev) => ({ ...prev, [obligationId]: count }));
    },
    []
  );

  return (
    <div className="space-y-3">
      {/* Barre TVA mensuelle : visible uniquement sur ce tracker.
          - Toggle Vue 3 mois (precedent/actuel/suivant) <-> Vue 12 mois (annee).
          - Chips de filtre par etiquette TVA (vitesse de realisation : Express
            / Standard / + longue / ...) configurables via /parametrage/tva-tags. */}
      {isTvaMensuelle && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-card px-3 py-2">
          {/* Toggle 3m / 12m */}
          <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setTvaView("3m")}
              aria-pressed={tvaView === "3m"}
              className={cn(
                "px-2.5 py-1 rounded text-[12px] font-medium transition-colors",
                tvaView === "3m"
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
              title="Affiche le mois précédent, le mois actuel et le mois suivant"
            >
              Vue 3 mois
            </button>
            <button
              type="button"
              onClick={() => setTvaView("12m")}
              aria-pressed={tvaView === "12m"}
              className={cn(
                "px-2.5 py-1 rounded text-[12px] font-medium transition-colors",
                tvaView === "12m"
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
              title="Affiche les 12 mois de l'année"
            >
              Vue annuelle
            </button>
          </div>

          {/* Repere visuel du mois actuel (vue 3m seulement) */}
          {tvaView === "3m" && tvaPeriodes3m && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              Mois actuel : <span className="font-medium text-zinc-700 dark:text-zinc-300">{tvaPeriodes3m.actuel}</span>
            </div>
          )}

          {/* Chips tags TVA */}
          {tvaTags && tvaTags.length > 0 && tvaTagCounts && (
            <>
              <div className="h-6 w-px bg-zinc-200 dark:bg-white/[0.08]" />
              <div className="flex items-center gap-1.5 flex-wrap">
                <StatusFilterChip
                  label="Tous"
                  count={tvaTagCounts.total}
                  active={tvaTagFilter === "all"}
                  onClick={() => setTvaTagFilter("all")}
                />
                {tvaTags.map((t) => (
                  <StatusFilterChip
                    key={t.id}
                    label={t.label}
                    count={tvaTagCounts.byTag.get(t.id) ?? 0}
                    active={tvaTagFilter === t.id}
                    onClick={() => setTvaTagFilter(t.id)}
                    accent={t.color as Parameters<typeof StatusFilterChip>[0]["accent"]}
                  />
                ))}
                {tvaTagCounts.none > 0 && (
                  <StatusFilterChip
                    label="Sans étiquette"
                    count={tvaTagCounts.none}
                    active={tvaTagFilter === "none"}
                    onClick={() => setTvaTagFilter("none")}
                  />
                )}
              </div>

              {/* Toggle tri Nom / Etiquette : groupé visuellement, à droite */}
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
                  <span className="px-1.5 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Tri</span>
                  <button
                    type="button"
                    onClick={() => setTvaSort("nom")}
                    aria-pressed={tvaSort === "nom"}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                      tvaSort === "nom"
                        ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 shadow-sm"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    )}
                  >
                    Nom
                  </button>
                  <button
                    type="button"
                    onClick={() => setTvaSort("etiquette")}
                    aria-pressed={tvaSort === "etiquette"}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                      tvaSort === "etiquette"
                        ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 shadow-sm"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    )}
                  >
                    Étiquette
                  </button>
                </div>
                <Link
                  href="/parametrage/tva-tags"
                  className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                  title="Créer ou modifier les étiquettes TVA"
                >
                  Gérer les étiquettes
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Barre d'outils unique, dense et ordonnee.
          Sur mobile : on remplace chips Statut/Cloture/Periode par 3 selects
          natifs dans une grille 2-cols + ligne search dediee, sinon les
          chips wrappaient sur 4-6 lignes et mangeaient tout l'ecran. */}

      {/* === Mobile === */}
      <div className="md:hidden rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-card px-3 py-2.5 space-y-2">
        <input
          type="text"
          placeholder="Filtrer par client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-2 rounded-md border border-zinc-300 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-base focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60 transition"
        />
        <div className="grid grid-cols-2 gap-2">
          <MobileFilterSelect
            label="Statut"
            value={
              statusFilter.size === 1
                ? [...statusFilter][0]
                : statusFilter.size === 0
                ? "all"
                : "multi"
            }
            onChange={(v) => {
              if (v === "all") setStatusFilter(new Set());
              else if (v !== "multi") setStatusFilter(new Set([v as StatutFilter]));
            }}
            options={[
              { value: "all", label: "Tous" },
              { value: "A_FAIRE", label: "À faire" },
              { value: "EN_COURS", label: "En cours" },
              { value: "TERMINE", label: "Terminé" },
              { value: "NON_APPLICABLE", label: "N/A" },
              ...(statusFilter.size > 1
                ? [{ value: "multi", label: `Multi (${statusFilter.size})` }]
                : []),
            ]}
          />
          {hasClotureBasedCols && clotureMoisPresents.length > 1 && (
            <MobileFilterSelect
              label="Clôture"
              value={
                filterCloture.size === 1
                  ? String([...filterCloture][0])
                  : filterCloture.size === 0
                  ? "all"
                  : "multi"
              }
              onChange={(v) => {
                if (v === "all") setFilterCloture(new Set());
                else if (v !== "multi") setFilterCloture(new Set([parseInt(v, 10)]));
              }}
              options={[
                { value: "all", label: "Toutes" },
                ...clotureMoisPresents.map((m) => ({
                  value: String(m),
                  label: MOIS_FR[m - 1],
                })),
                ...(filterCloture.size > 1
                  ? [{ value: "multi", label: `Multi (${filterCloture.size})` }]
                  : []),
              ]}
            />
          )}
          {cols.length > 1 && (
            <MobileFilterSelect
              label="Période"
              value={
                periodFilter.size === 1
                  ? [...periodFilter][0]
                  : periodFilter.size === 0
                  ? "all"
                  : "multi"
              }
              onChange={(v) => {
                if (v === "all") setPeriodFilter(new Set());
                else if (v !== "multi") setPeriodFilter(new Set([v]));
              }}
              options={[
                { value: "all", label: "Toutes" },
                ...cols.map((c) => ({ value: c.key, label: c.label })),
                ...(periodFilter.size > 1
                  ? [{ value: "multi", label: `Multi (${periodFilter.size})` }]
                  : []),
              ]}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filtered.length} client{filtered.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setAutoFit((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-all duration-150 active:scale-95",
              autoFit
                ? "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40"
                : "bg-white dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
            title="Ajuster les colonnes au contenu"
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
            Auto
          </button>
        </div>
      </div>

      {/* === Desktop : barre d'outils dense, chips inline === */}
      <div className="hidden md:flex items-center gap-2 flex-wrap rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-card px-3 py-2">
        <input
          type="text"
          placeholder="Filtrer par client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-64 px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60 transition"
        />
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <div className="inline-flex gap-1 items-center">
          <StatusFilterChip
            label="À faire"
            active={statusFilter.has("A_FAIRE")}
            onClick={(e) => handleStatusFilter("A_FAIRE", e)}
            accent="amber"
          />
          <StatusFilterChip
            label="En cours"
            active={statusFilter.has("EN_COURS")}
            onClick={(e) => handleStatusFilter("EN_COURS", e)}
            accent="sky"
          />
          <StatusFilterChip
            label="Terminé"
            active={statusFilter.has("TERMINE")}
            onClick={(e) => handleStatusFilter("TERMINE", e)}
            accent="emerald"
          />
          <StatusFilterChip
            label="N/A"
            active={statusFilter.has("NON_APPLICABLE")}
            onClick={(e) => handleStatusFilter("NON_APPLICABLE", e)}
            accent="zinc"
          />
        </div>
        {/* Filtre par mois de cloture (uniquement trackers annuels) */}
        {hasClotureBasedCols && clotureMoisPresents.length > 1 && (
          <>
            <div className="h-6 w-px bg-zinc-200 mx-1" />
            <div className="inline-flex gap-1 items-center flex-wrap" title="Filtrer par mois de clôture client">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">Clôture</span>
              {clotureMoisPresents.map((mois) => (
                <StatusFilterChip
                  key={mois}
                  label={MOIS_FR[mois - 1]}
                  active={filterCloture.has(mois)}
                  onClick={(e) => setFilterCloture(toggleFilterKey(filterCloture, mois, e))}
                  accent="zinc"
                />
              ))}
              {filterCloture.size > 0 && (
                <button
                  onClick={() => setFilterCloture(new Set())}
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors ml-0.5"
                  title="Toutes les clôtures"
                  aria-label="Réinitialiser le filtre clôture"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
        {cols.length > 1 && (
          <>
            <div className="h-6 w-px bg-zinc-200 mx-1" />
            <div className="inline-flex gap-1 items-center flex-wrap">
              {cols.map((c) => (
                <button
                  key={c.key}
                  onClick={(e) => togglePeriodFilter(c.key, e)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[11px] font-medium border transition-all duration-150 active:scale-95",
                    periodFilter.has(c.key)
                      ? "bg-zinc-100 dark:bg-white/[0.08] border-zinc-300 dark:border-white/[0.20] text-zinc-900 dark:text-zinc-50"
                      : "bg-white dark:bg-white/[0.02] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-white/[0.12]"
                  )}
                >
                  {c.label}
                </button>
              ))}
              {periodFilter.size > 0 && (
                <button
                  onClick={() => setPeriodFilter(new Set())}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors ml-0.5"
                  title="Toutes les périodes"
                >
                  ×
                </button>
              )}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoFit((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-all duration-150 active:scale-95",
              autoFit
                ? "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40"
                : "bg-white dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
            title="Ajuster les colonnes au contenu"
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
            Auto
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filtered.length} client{filtered.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div
        ref={tableRef}
        onKeyDown={onTableKeyDown}
        // overflow-x-auto (et non overflow-auto) : isole le scroll horizontal,
        // evite que le swipe lateral ouvre le drawer sidebar mobile et que le
        // browser hesite entre pan-x/pan-y. overscroll-behavior-x: contain
        // empeche le swipe en bord de table de declencher un back-nav iOS.
        // -webkit-overflow-scrolling: touch garde le momentum sur iOS Safari.
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
        className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] overflow-x-auto bg-card"
      >
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead className="bg-zinc-50 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-200 text-xs">
            <tr>
              <th
                // Largeur fixe sur la sticky col (w-, pas min-w) : sinon le
                // nom client + badges + chip TVA balonnaient la colonne et
                // mangeaient toute la viewport mobile, laissant ~50px pour
                // scroller les colonnes statuts.
                style={{ width: 150, minWidth: 150, maxWidth: 150 }}
                className="sticky left-0 z-10 bg-zinc-50 dark:bg-[hsl(var(--card))] text-left px-0 py-0 font-medium border-r border-zinc-200 dark:border-white/[0.06] md:!w-[220px] md:!min-w-[220px] md:!max-w-[220px]"
              >
                <button
                  onClick={selectAll}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[hsl(var(--gold))]/10 transition-colors group/all"
                  title="Tout sélectionner (Ctrl+A)"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 group-hover/all:border-[hsl(var(--gold))] group-hover/all:text-[hsl(var(--gold))] transition-colors">
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor" aria-hidden>
                      <rect x="1" y="1" width="6" height="6" rx="1" />
                      <rect x="9" y="1" width="6" height="6" rx="1" />
                      <rect x="1" y="9" width="6" height="6" rx="1" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                    </svg>
                  </span>
                  <span>Client</span>
                </button>
              </th>
              {/* Colonne dediee "Echeance" pour les trackers annuels a cloture.
                  Triable, affichee a droite du nom du dossier. */}
              {hasClotureBasedCols && (
                <th className="bg-zinc-50 dark:bg-white/[0.03] text-left px-3 py-2 font-medium border-r border-zinc-200 dark:border-white/[0.06] min-w-[150px] text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Échéance
                </th>
              )}
              {visibleCols.map((col, colIndex) => {
                const s = colStats[col.key];
                const pct = s.total > 0 ? Math.round((s.done * 100) / s.total) : 0;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "px-0 py-0 font-medium text-center",
                      !autoFit && "min-w-[78px] md:min-w-[120px]"
                    )}
                  >
                    <button
                      onClick={(e) => selectColumn(colIndex, e)}
                      className="w-full px-2 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors"
                      title="Sélectionner toute la colonne"
                    >
                      <div>{col.label}</div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-normal">
                        {s.done}/{s.total} ({pct}%)
                      </div>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, rowIndex) => (
              <tr key={r.clientId} className="border-t hover:bg-zinc-50/50">
                <td
                  // Largeur fixe synchronisee avec le th : essentiel pour
                  // que la colonne ne s'etire pas sur mobile (cf. th plus
                  // haut). overflow-hidden coupe l'eventuel debordement.
                  style={{ width: 150, minWidth: 150, maxWidth: 150 }}
                  className="sticky left-0 z-10 bg-white border-r group/row overflow-hidden md:!w-[220px] md:!min-w-[220px] md:!max-w-[220px]"
                >
                  <div className="flex items-stretch">
                    <button
                      onClick={(e) => selectRow(rowIndex, e)}
                      className="w-4 shrink-0 flex items-center justify-center text-zinc-300 hover:text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/10 opacity-0 group-hover/row:opacity-100 transition-all"
                      title="Sélectionner toute la ligne"
                      tabIndex={-1}
                    >
                      <span className="text-xs">≡</span>
                    </button>
                    <div className="flex-1 px-2 py-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link
                          href={`/clients/${r.clientSlug}`}
                          className="font-medium truncate hover:text-[hsl(var(--gold))] transition-colors min-w-0"
                        >
                          {r.denomination}
                        </Link>
                        {/* Badges Pappers/INPI : caches mobile (place comptee,
                            l'info est dans la fiche client). */}
                        <div className="hidden md:flex items-center gap-1.5 shrink-0">
                          <PappersInpiBadges siren={r.siren} size="xs" />
                        </div>
                      </div>
                      {r.siren && (
                        <Link
                          href={`/clients/${r.clientSlug}`}
                          className="block text-xs text-muted-foreground tabular-nums hover:text-[hsl(var(--gold))] transition-colors truncate"
                        >
                          {r.siren}
                        </Link>
                      )}
                      {/* Picker etiquette TVA : sous le nom plutot qu'a cote
                          pour ne pas etirer la sticky col mobile. Reste
                          tappable directement depuis le tracker. */}
                      {isTvaMensuelle && tvaTags && (
                        <div className="mt-1">
                          <InlineTvaTagPicker
                            tags={tvaTags}
                            currentTagId={r.tva_tag_id}
                            canEdit={canEditParametrage}
                            onChange={(tagId) => onChangeTvaTag(r.clientId, tagId)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {/* Colonne "Echeance" sur les trackers cloture-based */}
                {hasClotureBasedCols && (() => {
                  const due = computeNextEcheance(r);
                  if (!due) {
                    return (
                      <td className="px-3 py-2 border-r text-xs text-zinc-300">-</td>
                    );
                  }
                  const days = (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                  const dueIso = due.toISOString().substring(0, 10);
                  const color = days < 0
                    ? "text-rose-600 font-semibold"
                    : days <= 30
                    ? "text-amber-700 font-medium"
                    : "text-zinc-600";
                  const ago = days < 0
                    ? `${Math.abs(Math.round(days))}j en retard`
                    : days === 0
                    ? "aujourd'hui"
                    : `dans ${Math.round(days)}j`;
                  return (
                    <td
                      className={cn("px-3 py-2 border-r tabular-nums", color)}
                      title={
                        days < 0
                          ? `En retard de ${Math.abs(Math.round(days))} jour(s), échéance le ${fmtDateFr(dueIso)}`
                          : `Échéance dans ${Math.round(days)} jour(s), le ${fmtDateFr(dueIso)}`
                      }
                    >
                      <div className="text-sm">{fmtDateFr(dueIso)}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {r.mois_cloture && (
                          <span>
                            clôture {MOIS_FR[r.mois_cloture - 1]}{" "}
                            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>|</span>{" "}
                          </span>
                        )}
                        <span>{ago}</span>
                      </div>
                    </td>
                  );
                })()}
                {r.cells
                  .filter((c) => visibleColKeysSet.has(c.colKey))
                  .map((c, colIndex) => {
                  const cellId = `${r.clientId}|${c.colKey}`;
                  const isHighlighted = highlightedCellId === cellId;
                  const isOpenCell = openCellId === cellId;
                  const isSelected = !!c.obligationId && selectedIds.has(c.obligationId);
                  // Urgence : calculee a partir du type d'obligation, de la periode
                  // (du col) et de la cloture du client. cf. lib/echeances.ts
                  // colByKey = lookup O(1) (avant : 3× cols.find() par cellule).
                  const col = colByKey.get(c.colKey);
                  const urgency: UrgencyStatus = (() => {
                    if (!c.obligationId || !col?.periode) return "none";
                    const anneePeriode = extractAnneeFromPeriode(col.periode);
                    if (anneePeriode === null) return "none";
                    const cloture = (r.jour_cloture && r.mois_cloture)
                      ? { jour: r.jour_cloture, mois: r.mois_cloture }
                      : { jour: 31, mois: 12 };
                    const ech = computeEcheance(c.type, col.periode, anneePeriode, cloture);
                    return getUrgencyStatus(ech, c.statut_logique);
                  })();
                  const isAnchor =
                    isSelected && anchor?.row === rowIndex && anchor?.col === colIndex;
                  // Bordures façon Excel : on dessine un trait uniquement sur
                  // les côtés où le voisin n'est PAS sélectionné. Résultat :
                  // un grand rectangle continu englobant la zone.
                  const above = selectedCoords.has(`${rowIndex - 1}|${colIndex}`);
                  const below = selectedCoords.has(`${rowIndex + 1}|${colIndex}`);
                  const leftSel = selectedCoords.has(`${rowIndex}|${colIndex - 1}`);
                  const rightSel = selectedCoords.has(`${rowIndex}|${colIndex + 1}`);
                  const goldColor = "hsl(34, 32%, 52%)";
                  const tdStyle: React.CSSProperties | undefined = isSelected
                    ? (() => {
                        const parts: string[] = [];
                        if (!above)    parts.push(`inset 0 2px 0 0 ${goldColor}`);
                        if (!below)    parts.push(`inset 0 -2px 0 0 ${goldColor}`);
                        if (!leftSel)  parts.push(`inset 2px 0 0 0 ${goldColor}`);
                        if (!rightSel) parts.push(`inset -2px 0 0 0 ${goldColor}`);
                        return { boxShadow: parts.join(", ") };
                      })()
                    : undefined;
                  return (
                    <td
                      key={c.colKey}
                      data-cell-id={cellId}
                      data-obligation-id={c.obligationId ?? ""}
                      data-row-index={rowIndex}
                      data-col-index={colIndex}
                      style={tdStyle}
                      className={cn(
                        "group/cell px-1 py-1.5 text-center align-middle transition-colors",
                        isOpenCell && "relative z-40",
                        // Pas de fond pour les cellules commentées : le soulignage
                        // jaune est sur la pastille statut (cf. StatusCell).
                        isSelected && "bg-[hsl(var(--gold))]/10",
                        isAnchor && "bg-[hsl(var(--gold))]/20",
                        // Highlight Jarvis : equivalent visuel d'une cellule
                        // selectionnee + ancree (gold/20 background) + ring
                        // dore plus epais + ombre dore + animation pulse, pour
                        // bien attirer l'oeil quand on arrive via deep link.
                        isHighlighted && "relative z-30 bg-[hsl(var(--gold))]/20 ring-2 ring-[hsl(var(--gold))] ring-offset-2 ring-offset-white dark:ring-offset-[hsl(var(--card))] rounded-md shadow-[0_0_0_4px_hsl(var(--gold)/0.15)] animate-pulse"
                      )}
                      onMouseDown={(e) => onCellMouseDown(e, c.obligationId, rowIndex, colIndex)}
                    >
                      {col?.kind === "facturation" ? (
                        <FacturationOnlyCell
                          cell={c}
                          typeHonosBilans={r.type_honos_bilans}
                          canEdit={canEditProduction}
                          onSetFacturation={onSetFactStable}
                        />
                      ) : (
                        <StatusCell
                          cell={c}
                          cellId={cellId}
                          isOpen={openCellId === cellId}
                          isSelected={isSelected}
                          urgency={urgency}
                          options={statusOptions[c.type] ?? EMPTY_OPTIONS}
                          commentCount={c.obligationId ? commentCounts[c.obligationId] ?? 0 : 0}
                          rowLabel={`${r.denomination}, ${col?.label ?? c.type}`}
                          typeHonosBilans={r.type_honos_bilans}
                          canEdit={canEditProduction}
                          clientId={r.clientId}
                          onOpen={handleOpen}
                          onClose={handleClose}
                          onPick={onPick}
                          onReset={onReset}
                          onOpenComments={handleOpenComments}
                          onSetFacturation={onSetFactStable}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td
                  colSpan={visibleCols.length + 1}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun client ne correspond à ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'action de sélection multi-cellules · pastilles directes,
          plus lisible qu'un dropdown */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto max-w-5xl animate-slide-up-fade">
          <div className="rounded-xl bg-[#0D1122] dark:bg-[hsl(var(--surface-elevated))] text-white shadow-2xl ring-1 ring-white/10 dark:ring-white/[0.18]">
            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-white/10">
              <div className="text-sm font-medium">
                {selectedIds.size} cellule{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
              </div>
              <div className="text-[11px] text-zinc-400">
                Clic sur un statut pour l'appliquer à toute la sélection
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    const g = buildClipboardGrid();
                    if (g) setClipboard(g);
                    const tsv = buildSelectionTsv();
                    if (tsv) navigator.clipboard?.writeText(tsv).catch(() => {});
                  }}
                  className="text-xs px-2.5 py-1 rounded-md text-zinc-200 hover:bg-white/10 transition-colors"
                  title="Copier la sélection (Ctrl+C)"
                >
                  ⧉ Copier
                </button>
                {clipboard && (
                  <button
                    onClick={() => {
                      // Colle à partir de la 1ère cellule sélectionnée (top-left)
                      let anchorRow = -1, anchorCol = -1;
                      filtered.forEach((row, rowIndex) => {
                        const visCells = visibleCellsOf(rowIndex);
                        visCells.forEach((cell, colIndex) => {
                          if (cell.obligationId && selectedIds.has(cell.obligationId)) {
                            if (anchorRow === -1 || rowIndex < anchorRow || (rowIndex === anchorRow && colIndex < anchorCol)) {
                              anchorRow = rowIndex;
                              anchorCol = colIndex;
                            }
                          }
                        });
                      });
                      if (anchorRow !== -1) pasteClipboardAt(anchorRow, anchorCol);
                    }}
                    disabled={!canEditProduction}
                    className="text-xs px-2.5 py-1 rounded-md text-white bg-[hsl(var(--gold))] hover:opacity-90 transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
                    title={canEditProduction ? `Coller la grille ${clipboard.rows}×${clipboard.cols} (Ctrl+V)` : "Droit d'édition requis"}
                  >
                    Coller
                    <span className="opacity-90 font-mono text-[10px]">
                      {clipboard.rows}×{clipboard.cols}
                    </span>
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  className="text-xs px-2.5 py-1 rounded-md text-zinc-300 hover:bg-white/10 transition-colors"
                  title="Échap pour vider"
                >
                  Vider ✕
                </button>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
              {allStatusOptions.map((o) => (
                <button
                  key={o.libelle}
                  onClick={() => runBulk([...selectedIds], o.libelle)}
                  disabled={!canEditProduction}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-150 active:scale-95 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0",
                    statutColorClass(o.statut_logique, o.color)
                  )}
                  title={
                    canEditProduction
                      ? `Appliquer "${o.libelle}" à ${selectedIds.size} cellule${selectedIds.size > 1 ? "s" : ""}`
                      : "Droit d'édition requis"
                  }
                >
                  {o.libelle}
                </button>
              ))}
              <div className="h-5 w-px bg-white/20 mx-1" />
              <button
                onClick={() => runBulk([...selectedIds], null)}
                disabled={!canEditProduction}
                className="px-2.5 py-1 rounded-md text-xs text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={canEditProduction ? "Réinitialiser à la valeur par défaut du type" : "Droit d'édition requis"}
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popover commentaires (style Notion). Compact, ancré près de la cellule. */}
      {openCommentsObligId && (
        <CommentsPopover
          obligationId={openCommentsObligId}
          obligationLabel={openCommentsLabel}
          currentUserEmail={currentUserEmail}
          anchorRect={openCommentsAnchor}
          onClose={handleCloseComments}
          onCountChange={(count) =>
            handleCommentCountChange(openCommentsObligId, count)
          }
        />
      )}
    </div>
  );
}

// ============================================================================
//  InlineTvaTagPicker : chip cliquable a cote du nom client sur le tracker
//  tva-mensuelle. Click ouvre un popover avec liste des tags actifs + option
//  "Aucune". Affiche un placeholder discret "+ étiquette" si aucun tag.
// ============================================================================

const TVA_TAG_DOT_COLORS: Record<string, string> = {
  zinc: "bg-zinc-400 dark:bg-zinc-500",
  sky: "bg-sky-400 dark:bg-sky-500",
  emerald: "bg-emerald-400 dark:bg-emerald-500",
  amber: "bg-amber-400 dark:bg-amber-500",
  violet: "bg-violet-400 dark:bg-violet-500",
  rose: "bg-rose-400 dark:bg-rose-500",
  teal: "bg-teal-400 dark:bg-teal-500",
  indigo: "bg-indigo-400 dark:bg-indigo-500",
};

const TVA_TAG_BG_COLORS: Record<string, string> = {
  zinc: "bg-zinc-50 dark:bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-500/30",
  sky: "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  emerald: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  amber: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  violet: "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30",
  rose: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
  teal: "bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30",
  indigo: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30",
};

function InlineTvaTagPicker({
  tags,
  currentTagId,
  canEdit,
  onChange,
}: {
  tags: TvaTag[];
  currentTagId: string | null;
  /** Droit edit_parametrage : sans lui, le chip etiquette est grise. */
  canEdit: boolean;
  onChange: (tagId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = tags.find((t) => t.id === currentTagId) ?? null;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = (tags.length + 1) * 32 + 16;
    const POPOVER_WIDTH = 220;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open, tags.length]);

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
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!canEdit) return;
          setOpen((v) => !v);
        }}
        disabled={!canEdit}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors whitespace-nowrap",
          !canEdit && "opacity-50 cursor-not-allowed",
          current
            ? TVA_TAG_BG_COLORS[current.color] ?? TVA_TAG_BG_COLORS.zinc
            : cn(
                "border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-400 dark:text-zinc-500",
                canEdit && "hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-white/[0.20]"
              )
        )}
        title={
          !canEdit
            ? "Droit de paramétrage requis"
            : current
            ? `Étiquette : ${current.label}`
            : "Attribuer une étiquette TVA"
        }
      >
        {current ? (
          <>
            <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", TVA_TAG_DOT_COLORS[current.color] ?? TVA_TAG_DOT_COLORS.zinc)} />
            {current.label}
          </>
        ) : (
          "+ étiquette"
        )}
      </button>
      {open && pos && typeof document !== "undefined" &&
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
            className="min-w-[220px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {/* Option : aucune (visible si tag courant) */}
            {current && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-b border-zinc-100 dark:border-white/[0.06]"
              >
                — Retirer l&apos;étiquette
              </button>
            )}
            {tags.map((t) => {
              const isActive = currentTagId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onChange(t.id); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                    isActive && "bg-zinc-50 dark:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", TVA_TAG_DOT_COLORS[t.color] ?? TVA_TAG_DOT_COLORS.zinc)} />
                  <span className="flex-1 truncate">{t.label}</span>
                  {isActive && <span className="text-zinc-400 dark:text-zinc-500 text-xs">✓</span>}
                </button>
              );
            })}
            {tags.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 italic">
                Aucune étiquette créée
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

// Picker statut style Notion : sections groupées par statut_logique (À faire,
// En cours, Terminé, N/A), compact + fluide. La gestion de note libre est
// remplacée par le panel commentaires latéral (cliquable via icône 💬).
const STATUT_GROUP_ORDER: StatutLogique[] = ["A_FAIRE", "EN_COURS", "TERMINE", "NON_APPLICABLE"];
const STATUT_GROUP_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
};

/** Pour les types qui exposent une 2e pastille de facturation sous la cellule
 *  principale. AGO_DEPOT = facturation juridique. LIASSE_PLAQUETTE =
 *  facturation bilan (utile uniquement pour les clients avec
 *  type_honos_bilans = 'Facturés', mais la pastille est dispo pour tous). */
const TYPES_WITH_FACTURATION = new Set(["AGO_DEPOT", "LIASSE_PLAQUETTE"]);

/** Libellés de statut considérés comme "prêts à facturer" pour chaque type.
 *  Quand la cellule est dans cet état et que etat_facturation est null,
 *  on affiche "À facturer" par défaut. Indépendant de statut_logique pour
 *  rester robuste si migration 0051 (AGO Déposé -> TERMINE) pas appliquée. */
const BILLABLE_STATUT_DETAILS: Record<string, string[]> = {
  AGO_DEPOT: ["2 - Déposé", "3 - Validé par greffe"],
  LIASSE_PLAQUETTE: ["4 - Plaquette transmise"],
};

const FACT_PILL_OPTIONS: Array<{ key: EtatFacturation; label: string; color: string; onlyType?: string }> = [
  { key: "a_facturer", label: "À facturer", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "facturee", label: "Facturée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
  // "Offert" : bilans (LIASSE_PLAQUETTE) uniquement — cf. 1er bilan offert.
  { key: "offert", label: "Offert", color: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30", onlyType: "LIASSE_PLAQUETTE" },
  { key: "sans_facture", label: "Sans facture", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
];

const StatusCell = memo(function StatusCell({
  cell,
  cellId,
  isOpen,
  isSelected,
  urgency = "none",
  onOpen,
  onClose,
  options,
  commentCount,
  rowLabel,
  typeHonosBilans,
  canEdit,
  clientId,
  onPick,
  onReset,
  onOpenComments,
  onSetFacturation,
}: {
  cell: TrackerCell;
  cellId: string;
  isOpen: boolean;
  isSelected?: boolean;
  /** Niveau d'urgence calcule depuis lib/echeances.ts. */
  urgency?: UrgencyStatus;
  onOpen: (cellId: string) => void;
  onClose: () => void;
  options: StatusOption[];
  commentCount: number;
  rowLabel: string;
  /** Pour LIASSE_PLAQUETTE : la pastille facturation n'apparait QUE si la
   *  facturation bilan est separee ('Facturés'). 'Inclus' ou null = pas de
   *  facturation a suivre. */
  typeHonosBilans: string | null;
  /** Droit edit_production : sans lui, la pastille de statut est grisee et
   *  n'ouvre pas le picker (la lecture des commentaires reste possible). */
  canEdit: boolean;
  /** Id du client de la ligne : requis pour créer l'obligation quand la
   *  cellule est vide (pas encore d'obligationId). */
  clientId: string;
  onPick: (
    obligationId: string | null,
    libelle: string,
    type: string,
    clientId: string,
    colKey: string
  ) => void;
  onReset: (obligationId: string) => void;
  onOpenComments: (
    obligationId: string,
    label: string,
    anchorRect: { left: number; top: number; bottom: number; right: number }
  ) => void;
  onSetFacturation: (obligationId: string, etat: EtatFacturation | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-cell-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_ESTIMATED_HEIGHT = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_ESTIMATED_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      left: rect.left + rect.width / 2,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onScroll() {
      onClose();
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  // Groupes d'options par statut_logique pour le picker Notion-like.
  const grouped = useMemo(() => {
    const groups: Record<StatutLogique, StatusOption[]> = {
      A_FAIRE: [],
      EN_COURS: [],
      TERMINE: [],
      NON_APPLICABLE: [],
    };
    for (const opt of options) groups[opt.statut_logique].push(opt);
    return groups;
  }, [options]);

  // Cellule VIDE : aucune ligne en base. On la rend quand même cliquable —
  // choisir un statut créera l'obligation à la volée (cf. onPick). Plus de
  // "-" mort sur lequel on ne peut rien faire.
  const isEmpty = !cell.obligationId;

  const matchedOption = options.find((o) => o.libelle === cell.statut_detail);
  const colorClass = statutColorClass(cell.statut_logique, matchedOption?.color);
  const defaultLibelle = options.find((o) => o.statut_logique === "A_FAIRE")?.libelle ?? "-";

  // Pastille d'urgence : couleur selon le niveau calcule en amont
  // (cf. lib/echeances.ts).
  //  - 🟠 due_soon : echeance approche, periode active (a traiter)
  //  - 🔴 overdue  : echeance depassee + pas terminé (en retard)
  //  - none       : pas de signal (termine OU pas encore actif)
  const urgencyPastille = urgency === "overdue"
    ? "bg-rose-500"
    : urgency === "due_soon"
    ? "bg-amber-500"
    : null;

  return (
    <div className="relative inline-block" ref={ref}>
      {urgencyPastille && (
        <span
          aria-label={urgency === "overdue" ? "En retard" : "Échéance proche"}
          title={
            urgency === "overdue"
              ? `En retard${cell.echeance ? `, échéance le ${fmtDateFr(cell.echeance)}` : ""}`
              : `Échéance proche${cell.echeance ? `, le ${fmtDateFr(cell.echeance)}` : ""}`
          }
          className={cn(
            "absolute -top-0.5 -right-0.5 z-10 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-[hsl(var(--card))] pointer-events-none",
            urgencyPastille
          )}
        />
      )}
      {urgency === "overdue" && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-10 text-[8px] leading-none font-bold tracking-wider uppercase px-1 py-0.5 rounded bg-rose-500 text-white pointer-events-none whitespace-nowrap"
          aria-hidden
        >
          Retard
        </span>
      )}
      <button
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault();
            return;
          }
          if (!canEdit) return;
          onOpen(cellId);
        }}
        disabled={!canEdit}
        data-cell-button="1"
        tabIndex={0}
        style={
          // Soulignage jaune sous la pastille si commentaires (style Notion).
          // box-shadow inset → pas de modif de taille, contrairement à un border.
          commentCount > 0
            ? { boxShadow: "inset 0 -2px 0 0 rgb(251 191 36)" } // amber-400
            : undefined
        }
        className={cn(
          "relative inline-block px-2 py-1 rounded-md text-[11px] font-medium border max-w-[110px] truncate transition-all focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-1",
          canEdit ? "hover:opacity-80 hover:shadow-sm" : "opacity-50 cursor-not-allowed",
          // Vide : bordure pointillée discrète, se révèle au survol pour
          // signaler qu'elle est activable.
          isEmpty
            ? "border-dashed border-zinc-200 dark:border-white/[0.12] text-zinc-300 dark:text-zinc-600 bg-transparent hover:text-zinc-500 dark:hover:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/[0.20]"
            : colorClass
        )}
        title={
          !canEdit
            ? "Droit d'édition requis"
            : isEmpty
            ? "Aucune obligation enregistrée, cliquer pour la créer avec un statut"
            : cell.echeance
            ? `Échéance : ${fmtDateFr(cell.echeance)}`
            : undefined
        }
      >
        {isEmpty ? "-" : cell.statut_detail ?? defaultLibelle}
      </button>


      {/* Bulle commentaires (style Notion).
          - En position ABSOLUTE → sort du flux, la cellule ne se déforme pas
            au hover (la pastille statut garde sa position).
          - Cachée par défaut, visible UNIQUEMENT au hover du td parent
            (group/cell sur le td).
          - Sur mobile (pas de hover), affichage léger pour qu'elle reste
            tappable. */}
      {cell.obligationId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!cell.obligationId) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpenComments(cell.obligationId, rowLabel, {
              left: rect.left,
              top: rect.top,
              bottom: rect.bottom,
              right: rect.right,
            });
          }}
          className={cn(
            "absolute left-full top-1/2 -translate-y-1/2 ml-0.5",
            "inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-opacity",
            // Cachée par défaut, révélée au hover du td parent
            "opacity-0 group-hover/cell:opacity-100",
            // Mobile : visible discrètement (pas de hover réel sur touch)
            "max-md:opacity-60",
            commentCount > 0
              ? "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 font-medium"
              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          )}
          title={
            commentCount > 0
              ? `${commentCount} commentaire${commentCount > 1 ? "s" : ""}`
              : "Ajouter un commentaire"
          }
          aria-label={
            commentCount > 0
              ? `${commentCount} commentaire${commentCount > 1 ? "s" : ""}`
              : "Ajouter un commentaire"
          }
        >
          <MessageSquare className="h-3 w-3" />
          {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
        </button>
      )}

      {isOpen && pos && (
        <div
          style={{
            position: "fixed",
            left: `${pos.left}px`,
            top: `${pos.top}px`,
            transform: pos.openUp
              ? "translate(-50%, calc(-100% - 8px))"
              : "translate(-50%, 8px)",
            zIndex: 1000,
          }}
          className="bg-white border rounded-lg shadow-xl min-w-[240px] text-left animate-slide-up-fade overflow-hidden"
        >
          {cell.echeance && (
            <div className="px-3 py-1.5 text-[10px] text-zinc-500 border-b bg-zinc-50/50">
              Échéance : <span className="font-medium text-zinc-700 tabular-nums">{fmtDateFr(cell.echeance)}</span>
            </div>
          )}

          {/* Statut courant en gros (style Notion) */}
          <div className="px-3 py-2 border-b">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Statut actuel</div>
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border",
                colorClass
              )}
            >
              {cell.statut_detail ?? defaultLibelle}
            </span>
          </div>

          {/* Sections par statut_logique (style Notion) */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">
                Pas de libellés disponibles.
              </div>
            ) : (
              STATUT_GROUP_ORDER.map((groupKey) => {
                const groupOpts = grouped[groupKey];
                if (groupOpts.length === 0) return null;
                return (
                  <div key={groupKey} className="py-0.5">
                    <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-zinc-400 font-medium">
                      {STATUT_GROUP_LABEL[groupKey]}
                    </div>
                    {groupOpts.map((opt) => (
                      <button
                        key={opt.libelle}
                        onClick={() => onPick(cell.obligationId, opt.libelle, cell.type, clientId, cell.colKey)}
                        className={cn(
                          "w-full text-left px-3 py-1 text-xs hover:bg-zinc-100 flex items-center gap-2 transition-colors",
                          cell.statut_detail === opt.libelle && "bg-zinc-50"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap",
                            statutColorClass(opt.statut_logique, opt.color)
                          )}
                        >
                          {opt.libelle}
                        </span>
                        {cell.statut_detail === opt.libelle && (
                          <span className="text-zinc-400 ml-auto text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer : actions secondaires (commentaires + reset) */}
          <div className="border-t bg-zinc-50/50">
            <button
              onClick={(e) => {
                if (!cell.obligationId) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onOpenComments(cell.obligationId, rowLabel, {
                  left: rect.left,
                  top: rect.top,
                  bottom: rect.bottom,
                  right: rect.right,
                });
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 transition-colors flex items-center gap-2"
            >
              <MessageSquare className="h-3 w-3 text-zinc-500" />
              <span>
                {commentCount > 0
                  ? `Commentaires (${commentCount})`
                  : "Ajouter un commentaire"}
              </span>
            </button>
            {cell.statut_detail && (
              <button
                onClick={() => cell.obligationId && onReset(cell.obligationId)}
                className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 transition-colors border-t"
              >
                Réinitialiser le statut
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.cell.obligationId === next.cell.obligationId &&
    prev.cell.statut_logique === next.cell.statut_logique &&
    prev.cell.statut_detail === next.cell.statut_detail &&
    prev.cell.echeance === next.cell.echeance &&
    prev.cell.type === next.cell.type &&
    prev.cell.etat_facturation === next.cell.etat_facturation &&
    prev.urgency === next.urgency &&
    prev.typeHonosBilans === next.typeHonosBilans &&
    prev.isOpen === next.isOpen &&
    prev.isSelected === next.isSelected &&
    prev.canEdit === next.canEdit &&
    prev.options === next.options &&
    prev.commentCount === next.commentCount &&
    prev.rowLabel === next.rowLabel &&
    prev.onOpen === next.onOpen &&
    prev.onClose === next.onClose &&
    prev.onPick === next.onPick &&
    prev.onReset === next.onReset &&
    prev.onOpenComments === next.onOpenComments &&
    prev.onSetFacturation === next.onSetFacturation
  );
});

// ============================================================================
//  FacturationMiniPill - 2e pastille compacte sous la cellule pour les types
//  qui exposent un suivi facturation (AGO_DEPOT). Picker independant rendu en
//  portal pour echapper au clipping de la table.
// ============================================================================

// ============================================================================
//  FacturationOnlyCell - rendu dedie aux colonnes col.kind = 'facturation'.
//  Affiche uniquement la pastille facturation, pas de statut metier, pas de
//  commentaires, pas de popover statut. Filtre LIASSE_PLAQUETTE : pastille
//  cachee si bilan inclus / non renseigne.
// ============================================================================

function FacturationOnlyCell({
  cell,
  typeHonosBilans,
  canEdit,
  onSetFacturation,
}: {
  cell: TrackerCell;
  typeHonosBilans: string | null;
  /** Droit edit_production : sans lui, la pastille facturation est grisee. */
  canEdit: boolean;
  onSetFacturation: (obligationId: string, etat: EtatFacturation | null) => void;
}) {
  // Pas d'obligation -> dash discret
  if (!cell.obligationId) {
    return <span className="text-zinc-300 dark:text-zinc-600 text-xs">-</span>;
  }
  // LIASSE_PLAQUETTE : facturation pertinente uniquement si bilan facture
  if (cell.type === "LIASSE_PLAQUETTE" && typeHonosBilans !== "Facturés") {
    return (
      <span
        className="text-zinc-300 dark:text-zinc-600 text-xs italic"
        title={typeHonosBilans === "Inclus" ? "Bilan inclus dans le forfait" : "Type honos bilans à renseigner"}
      >
        -
      </span>
    );
  }
  // "Pret a facturer" : statut TERMINE ou libelle dans la liste billable.
  const billableLibelles = BILLABLE_STATUT_DETAILS[cell.type] ?? [];
  const isReady =
    cell.statut_logique === "TERMINE" ||
    (cell.statut_detail !== null && billableLibelles.includes(cell.statut_detail));
  return (
    <FacturationMiniPill
      value={cell.etat_facturation}
      isReadyForBilling={isReady}
      canEdit={canEdit}
      cellType={cell.type}
      onChange={(v) => onSetFacturation(cell.obligationId!, v)}
    />
  );
}

function FacturationMiniPill({
  value,
  isReadyForBilling,
  canEdit,
  cellType,
  onChange,
}: {
  value: EtatFacturation | null;
  /** True quand la prestation est achevee (statut_logique = TERMINE) : on
   *  affiche "À facturer" par defaut au lieu du placeholder "Fact. ?". */
  isReadyForBilling: boolean;
  /** Droit edit_production : sans lui, la pastille est grisee. */
  canEdit: boolean;
  /** Type d'obligation de la cellule (filtre les options : "Offert" = bilan). */
  cellType: string;
  onChange: (v: EtatFacturation | null) => void;
}) {
  // Options visibles selon le type (ex. "Offert" réservé aux bilans).
  const opts = FACT_PILL_OPTIONS.filter((o) => !o.onlyType || o.onlyType === cellType);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  // Si la prestation est achevee et que rien n'a ete decide, on affiche par
  // defaut "À facturer" (sans ecrire en DB - la valeur reelle reste null).
  const effective: EtatFacturation | null =
    value === null && isReadyForBilling ? "a_facturer" : value;
  const current = effective ? FACT_PILL_OPTIONS.find((o) => o.key === effective) : null;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = opts.length * 32 + 50;
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
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!canEdit) return;
          setOpen((v) => !v);
        }}
        disabled={!canEdit}
        title={
          !canEdit
            ? "Droit d'édition requis"
            : isReadyForBilling
            ? "Facturation - prestation terminée"
            : "Facturation - prestation pas encore terminée"
        }
        className={cn(
          "inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium border transition-all leading-tight",
          canEdit ? "hover:opacity-80" : "opacity-50 cursor-not-allowed",
          current
            ? current.color
            : "bg-transparent text-zinc-300 dark:text-zinc-600 border-dashed border-zinc-200 dark:border-white/[0.08]"
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
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b dark:border-white/[0.06]">
              Facturation juridique
            </div>
            {opts.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(o.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                  value === o.key && "bg-zinc-50 dark:bg-white/[0.04]"
                )}
              >
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                  {o.label}
                </span>
                {value === o.key && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
              </button>
            ))}
            {value !== null && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
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
    </>
  );
}
