"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Copy,
  Plus,
  X,
  Pencil,
  Trash2,
  Settings,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useConfirm } from "@/app/_components/confirm-modal";
import { StatusFilterChip } from "@/app/_components/status-filter-chip";
import { MobileFilterSelect } from "@/app/_components/mobile-filter-select";
import { toggleFilterKey } from "@/app/_components/filter-multi-select";
import { Picker } from "@/app/_components/picker";
import { useLocalStoragePref, useLocalStorageSet } from "@/app/_components/use-local-storage-pref";
import {
  createMission,
  createMissionType,
  deleteMission,
  deleteMissionType,
  duplicateMission,
  renameMissionType,
  setEtatFacturation,
  setEtatMission,
  setLdmStatutMission,
  setMissionTypeActif,
  setMissionTypeTarif,
  updateMission,
  type EtatFacturation,
  type EtatMission,
  type LdmStatutMission,
} from "./actions";
import MissionExcCommentsPopover from "./comments-popover";

// ============================================================================
//  Types
// ============================================================================

export type MissionExcRow = {
  id: string;
  slug: string;
  client_id: string | null;
  client_libre: string | null;
  client_slug: string | null;
  client_denomination: string | null;
  mission: string;
  type_id: string | null;
  description: string | null;
  duree_theorique_h: number | null;
  duree_reelle_h: number | null;
  taux_horaire: number | null;
  forfait: number | null;
  etat_mission: EtatMission;
  /** null = mission pas encore livree -> on affiche "—". Le trigger DB et
   *  l'auto-fact applicatif set automatiquement a "a_facturer" au passage
   *  en "livree". */
  etat_facturation: EtatFacturation | null;
  ldm_statut: LdmStatutMission;
  date_debut: string | null;
  date_fin: string | null;
};

export type MissionExcType = {
  id: string;
  slug: string;
  label: string;
  ordre: number;
  actif: boolean;
  /** Tarif par defaut (forfait HT). Pre-remplit le forfait a la creation. */
  tarif: number;
};

export type MissionExcClientOption = {
  id: string;
  slug: string;
  denomination: string;
};

// ============================================================================
//  Constantes UI : libelles + couleurs pour les pickers
// ============================================================================

const ETAT_MISSION_OPTIONS: Array<{
  key: EtatMission;
  label: string;
  color: string;
}> = [
  {
    key: "a_demarrer",
    label: "À démarrer",
    color:
      "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50",
  },
  {
    key: "en_cours",
    label: "En cours",
    color:
      "bg-sky-50 dark:bg-sky-500/25 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/50",
  },
  {
    key: "livree",
    label: "Livrée",
    color:
      "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50",
  },
  {
    key: "annulee",
    label: "Annulée",
    color:
      "bg-zinc-50 dark:bg-white/[0.05] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.10] line-through",
  },
];

const ETAT_FACTURATION_OPTIONS: Array<{
  key: EtatFacturation;
  label: string;
  color: string;
}> = [
  {
    key: "a_facturer",
    label: "À facturer",
    color:
      "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50",
  },
  {
    key: "facturee",
    label: "Facturée",
    color:
      "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50",
  },
  {
    key: "sans_facture",
    label: "Sans facture",
    color:
      "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]",
  },
];

// Palette de couleurs pour les types de mission. Chaque type recoit une couleur
// stable derivee de son slug (hash modulo palette) : le meme type aura toujours
// la meme couleur, et les types differents ressortent visuellement.
const TYPE_COLOR_PALETTE: string[] = [
  "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30",
  "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
  "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30",
  "bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30",
  "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-500/30",
  "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
  "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30",
];

function colorForType(slug: string | null | undefined): string {
  if (!slug) return TYPE_COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return TYPE_COLOR_PALETTE[hash % TYPE_COLOR_PALETTE.length];
}

// Statut LDM pour les missions exceptionnelles. La LDM (lettre de mission) peut
// etre necessaire ou pas selon la mission. N/A = pas besoin de LDM pour cette
// mission ponctuelle.
const LDM_STATUT_OPTIONS: Array<{
  key: LdmStatutMission;
  label: string;
  color: string;
}> = [
  {
    key: "a_faire",
    label: "À faire",
    color:
      "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50",
  },
  {
    key: "na",
    label: "N/A",
    color:
      "bg-zinc-50 dark:bg-white/[0.05] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.10]",
  },
  {
    key: "envoyee",
    label: "Envoyée en signature",
    color:
      "bg-sky-50 dark:bg-sky-500/25 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/50",
  },
  {
    key: "signee",
    label: "Signée",
    color:
      "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50",
  },
];

// ============================================================================
//  Helpers de formatage
// ============================================================================

function formatEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return (
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 0,
    }).format(Math.round(n)) + " € HT"
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  // ISO YYYY-MM-DD -> JJ/MM/AAAA
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// ============================================================================
//  Composant principal
// ============================================================================

// Filtres etat / facturation : Set vide = "Tous". Multi-select via Cmd/Ctrl+clic.
type FilterMission = EtatMission;
type FilterFact = EtatFacturation;
// Filtre type : "all" = tous, "none" = missions sans type, sinon UUID du type.
type FilterType = "all" | "none" | string;

export default function MissionExcTable({
  rows,
  types,
  clientOptions,
  initialCommentCounts,
  currentUserEmail,
}: {
  rows: MissionExcRow[];
  types: MissionExcType[];
  clientOptions: MissionExcClientOption[];
  /** Compteur initial de commentaires par mission_id, charge en SSR. */
  initialCommentCounts?: Record<string, number>;
  /** Email du user courant (pour distinguer "Moi" dans les commentaires). */
  currentUserEmail?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  const [localTypes, setLocalTypes] = useState(types);
  const [adding, setAdding] = useState(false);
  const [editingTypes, setEditingTypes] = useState(false);
  // Filtres persistes dans localStorage (filterType reste local, change peu)
  const [filterMission, setFilterMission] = useLocalStorageSet<FilterMission>(
    "moon.missionsExc.filterMission",
    new Set(),
    (k): k is FilterMission =>
      k === "a_demarrer" || k === "en_cours" || k === "livree" || k === "annulee",
  );
  const [filterFact, setFilterFact] = useLocalStorageSet<FilterFact>(
    "moon.missionsExc.filterFact",
    new Set(),
    (k): k is FilterFact => k === "a_facturer" || k === "facturee" || k === "sans_facture",
  );
  const [filterType, setFilterType] = useState<FilterType>("all");
  // Toggle "Masquer terminees" : par defaut on cache les missions ou les 3 axes
  // (mission / facturation / LDM) sont au stade terminal -> rien a faire dessus.
  // Persiste en localStorage pour que le user n'ait pas a le re-cocher a chaque
  // ouverture de la page.
  const [hideDone, setHideDone] = useLocalStoragePref<boolean>(
    "moon.missionsExc.hideDone",
    true,
    (raw) => (raw === "true" ? true : raw === "false" ? false : null),
    (val) => String(val),
  );

  // Commentaires : compteur par mission + state du popover ouvert. Pattern
  // aligne sur le tracker obligations.
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    initialCommentCounts ?? {},
  );
  const [openCommentsFor, setOpenCommentsFor] = useState<{
    missionId: string;
    missionLabel: string;
    anchorRect: { left: number; top: number; bottom: number; right: number };
  } | null>(null);

  // Tri par colonne : 1 clic = asc, 2 clics = desc, 3 clics = reset (= ordre
  // initial du serveur, date_debut DESC). Persiste en localStorage pour
  // garder la preference du user entre les sessions.
  type SortKey = "client" | "type" | "mission" | "forfait" | "etat_mission" | "facturation" | "ldm";
  type SortDir = "asc" | "desc";
  type SortState = { key: SortKey; dir: SortDir } | null;
  const [sort, setSort] = useLocalStoragePref<SortState>(
    "moon.missionsExc.sort",
    null,
    (raw) => {
      try {
        const v = JSON.parse(raw);
        if (!v || !v.key || !v.dir) return null;
        const validKeys: SortKey[] = ["client", "type", "mission", "forfait", "etat_mission", "facturation", "ldm"];
        if (!validKeys.includes(v.key)) return null;
        if (v.dir !== "asc" && v.dir !== "desc") return null;
        return v as SortState;
      } catch {
        return null;
      }
    },
  );
  function cycleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // 3e clic = reset
    });
  }

  /** Une mission est "100% terminee" quand chaque axe est dans un etat
   *  terminal (= plus rien a faire dessus) :
   *    - mission   : livree ou annulee
   *    - facturation : facturee ou sans_facture
   *    - LDM       : signee ou na (pas besoin de LDM pour cette mission)
   *  C'est ce qui justifie de la masquer par defaut : elle ne pollue plus la
   *  vue de pilotage.
   */
  function isMissionFullyDone(r: MissionExcRow): boolean {
    const missionDone = r.etat_mission === "livree" || r.etat_mission === "annulee";
    const factDone = r.etat_facturation === "facturee" || r.etat_facturation === "sans_facture";
    const ldmDone = r.ldm_statut === "signee" || r.ldm_statut === "na";
    return missionDone && factDone && ldmDone;
  }

  useEffect(() => setLocalRows(rows), [rows]);
  useEffect(() => setLocalTypes(types), [types]);
  // Si le type filtre actif est desactive ou supprime, reset le filtre pour
  // eviter un select "Tous les types" vide qui continue de filtrer en sous-marin.
  useEffect(() => {
    if (filterType === "all" || filterType === "none") return;
    const stillValid = localTypes.some((t) => t.actif && t.id === filterType);
    if (!stillValid) setFilterType("all");
  }, [localTypes, filterType]);
  const { confirm, ConfirmDialog } = useConfirm();

  const typesById = useMemo(
    () => new Map(localTypes.map((t) => [t.id, t])),
    [localTypes]
  );

  // ============================================================================
  //  Recap : compteurs + totaux
  // ============================================================================
  const recap = useMemo(() => {
    const r = {
      total: localRows.length,
      en_cours: 0,
      a_demarrer: 0,
      livree: 0,
      a_facturer: 0,
      facturee: 0,
      // CA potentiel/facture (= forfait)
      ca_a_facturer: 0,
      ca_facture: 0,
    };
    for (const row of localRows) {
      if (row.etat_mission === "en_cours") r.en_cours++;
      if (row.etat_mission === "a_demarrer") r.a_demarrer++;
      if (row.etat_mission === "livree") r.livree++;
      if (row.etat_facturation === "a_facturer") r.a_facturer++;
      if (row.etat_facturation === "facturee") r.facturee++;
      const m = row.forfait ?? 0;
      if (row.etat_mission !== "annulee") {
        if (row.etat_facturation === "a_facturer") r.ca_a_facturer += m;
        if (row.etat_facturation === "facturee") r.ca_facture += m;
      }
    }
    return r;
  }, [localRows]);

  // ============================================================================
  //  Filtrage + tri
  // ============================================================================
  const filteredRows = useMemo(() => {
    const filtered = localRows.filter((r) => {
      // Hideout par defaut des missions 100% terminees (rien a faire sur les 3
      // axes). Ne s'applique pas si l'utilisateur a explicitement filtre sur
      // un statut terminal (ex. veut voir uniquement les "Facturées").
      if (hideDone && isMissionFullyDone(r)) return false;
      if (filterMission.size > 0 && !filterMission.has(r.etat_mission)) return false;
      // etat_facturation peut etre null -> exclu si le filtre fact est actif
      if (filterFact.size > 0) {
        if (!r.etat_facturation || !filterFact.has(r.etat_facturation)) return false;
      }
      if (filterType === "none" && r.type_id !== null) return false;
      if (filterType !== "all" && filterType !== "none" && r.type_id !== filterType) return false;
      return true;
    });
    // Si pas de tri actif, on garde l'ordre du serveur (date_debut DESC).
    if (!sort) return filtered;
    // Ordres semantiques pour les statuts (asc = avance, ce qui est plus
    // utile en pratique : on voit d'abord ce qui est en cours / a faire).
    const etatMissionOrder: Record<EtatMission, number> = {
      a_demarrer: 1, en_cours: 2, livree: 3, annulee: 4,
    };
    const etatFactOrder: Record<EtatFacturation, number> = {
      a_facturer: 1, facturee: 2, sans_facture: 3,
    };
    const ldmOrder: Record<LdmStatutMission, number> = {
      a_faire: 1, envoyee: 2, signee: 3, na: 4,
    };
    function val(r: MissionExcRow): string | number {
      switch (sort!.key) {
        case "client":
          return (r.client_denomination ?? r.client_libre ?? "").toLocaleLowerCase("fr");
        case "type": {
          const t = r.type_id ? typesById.get(r.type_id) : null;
          return (t?.label ?? "").toLocaleLowerCase("fr");
        }
        case "mission":
          return (r.mission ?? "").toLocaleLowerCase("fr");
        case "forfait":
          return r.forfait ?? 0;
        case "etat_mission":
          return etatMissionOrder[r.etat_mission] ?? 99;
        case "facturation":
          return r.etat_facturation ? etatFactOrder[r.etat_facturation] : 99;
        case "ldm":
          return ldmOrder[r.ldm_statut] ?? 99;
      }
    }
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
      return String(va).localeCompare(String(vb), "fr") * sign;
    });
  }, [localRows, filterMission, filterFact, filterType, hideDone, sort, typesById]);
  // Nombre de missions masquees par le toggle hideDone (independant des autres
  // filtres) -> affiche en sous-info quand hideDone est actif.
  const hiddenDoneCount = useMemo(
    () => localRows.filter(isMissionFullyDone).length,
    [localRows],
  );

  // Compteurs pour les chips de filtre. Total absolu par etat (independant des
  // autres filtres) pour rester lisibles : on voit toujours combien y'en a au
  // total dans chaque categorie, indep. du filtre courant.
  const counts = useMemo(() => {
    const mission: Record<EtatMission, number> = { a_demarrer: 0, en_cours: 0, livree: 0, annulee: 0 };
    const fact: Record<EtatFacturation, number> = { a_facturer: 0, facturee: 0, sans_facture: 0 };
    const type = new Map<string, number>(); // type_id -> count
    let typeNone = 0;
    for (const r of localRows) {
      mission[r.etat_mission as EtatMission]++;
      if (r.etat_facturation) fact[r.etat_facturation as EtatFacturation]++;
      if (r.type_id) type.set(r.type_id, (type.get(r.type_id) ?? 0) + 1);
      else typeNone++;
    }
    return { mission, fact, type, typeNone, total: localRows.length };
  }, [localRows]);

  // ============================================================================
  //  Mutations
  // ============================================================================

  function patchRow(id: string, patch: Partial<MissionExcRow>) {
    setLocalRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function onSaveField(
    id: string,
    field: keyof MissionExcRow,
    value: string | number | null
  ) {
    patchRow(id, { [field]: value } as Partial<MissionExcRow>);
    startTransition(async () => {
      try {
        await updateMission(id, { [field]: value });
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onChangeClient(id: string, clientId: string | null, libre: string | null) {
    const opt = clientId ? clientOptions.find((o) => o.id === clientId) : null;
    patchRow(id, {
      client_id: clientId,
      client_libre: libre,
      client_slug: opt?.slug ?? null,
      client_denomination: opt?.denomination ?? null,
    });
    startTransition(async () => {
      try {
        await updateMission(id, {
          client_id: clientId,
          client_libre: libre,
        });
      } catch (e) {
        toastError(e, "Echec sauvegarde client");
        router.refresh();
      }
    });
  }

  function onSetEtatMission(id: string, etat: EtatMission) {
    // Auto-facturation : passage en "livree" + facturation null -> "a_facturer".
    // Cf. trigger DB auto_facturation_on_livree_mex. Optimistic mirror.
    const current = localRows.find((r) => r.id === id);
    const patch: Partial<MissionExcRow> = { etat_mission: etat };
    if (etat === "livree" && !current?.etat_facturation) {
      patch.etat_facturation = "a_facturer";
    }
    patchRow(id, patch);
    startTransition(async () => {
      try {
        await setEtatMission(id, etat);
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onSetEtatFacturation(id: string, etat: EtatFacturation | null) {
    patchRow(id, { etat_facturation: etat });
    startTransition(async () => {
      try {
        await setEtatFacturation(id, etat);
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onSetLdmStatut(id: string, statut: LdmStatutMission) {
    patchRow(id, { ldm_statut: statut });
    startTransition(async () => {
      try {
        await setLdmStatutMission(id, statut);
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onSetType(id: string, typeId: string | null) {
    patchRow(id, { type_id: typeId });
    startTransition(async () => {
      try {
        await updateMission(id, { type_id: typeId });
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onDuplicate(row: MissionExcRow) {
    startTransition(async () => {
      try {
        await duplicateMission(row.id);
        toastSuccess("Mission dupliquée");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec duplication");
      }
    });
  }

  async function onDelete(row: MissionExcRow) {
    const ok = await confirm({
      title: `Supprimer cette mission ?`,
      description: `« ${row.mission} » pour ${row.client_denomination ?? row.client_libre ?? "-"}. Cette action est irréversible.`,
      variant: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
    startTransition(async () => {
      try {
        await deleteMission(row.id);
        toastSuccess("Mission supprimée");
      } catch (e) {
        toastError(e, "Echec suppression");
        router.refresh();
      }
    });
  }

  // ============================================================================
  //  Rendu
  // ============================================================================

  return (
    <div className="space-y-5">
      {ConfirmDialog}

      {/* Recap KPI */}
      <RecapCards recap={recap} />

      {/* Toolbar : filtres chips + actions
          Coherence visuelle avec IR/CAA/Creations : 3 bandeaux de chips au lieu
          de selects natifs. Chaque chip affiche le compteur global par etat.
          Mobile : on remplace tous les chips par des selects compacts dans
          une grille 2 colonnes pour eviter le wrap qui mangeait tout l'ecran. */}

      {/* === Mobile : grille de selects compacte === */}
      <div className="md:hidden space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MobileFilterSelect
            label="Mission"
            value={filterMission.size === 1 ? [...filterMission][0] : "all"}
            onChange={(v) =>
              setFilterMission(v === "all" ? new Set() : new Set([v as FilterMission]))
            }
            options={[
              { value: "all", label: `Toutes (${counts.total})` },
              { value: "a_demarrer", label: `À démarrer (${counts.mission.a_demarrer})` },
              { value: "en_cours", label: `En cours (${counts.mission.en_cours})` },
              { value: "livree", label: `Livrée (${counts.mission.livree})` },
              { value: "annulee", label: `Annulée (${counts.mission.annulee})` },
            ]}
          />
          <MobileFilterSelect
            label="Facturation"
            value={filterFact.size === 1 ? [...filterFact][0] : "all"}
            onChange={(v) =>
              setFilterFact(v === "all" ? new Set() : new Set([v as FilterFact]))
            }
            options={[
              { value: "all", label: `Toutes (${counts.total})` },
              { value: "a_facturer", label: `À facturer (${counts.fact.a_facturer})` },
              { value: "facturee", label: `Facturée (${counts.fact.facturee})` },
              { value: "sans_facture", label: `Sans facture (${counts.fact.sans_facture})` },
            ]}
          />
          {(localTypes.filter((t) => t.actif).length > 0 || counts.typeNone > 0) && (
            <MobileFilterSelect
              label="Type"
              value={filterType}
              onChange={(v) => setFilterType(v as FilterType)}
              options={[
                { value: "all", label: `Tous (${counts.total})` },
                ...localTypes
                  .filter((t) => t.actif)
                  .map((t) => ({
                    value: t.id,
                    label: `${t.label} (${counts.type.get(t.id) ?? 0})`,
                  })),
                ...(counts.typeNone > 0
                  ? [{ value: "none", label: `Sans type (${counts.typeNone})` }]
                  : []),
              ]}
            />
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none px-1 py-1">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-white/[0.15] accent-zinc-700 dark:accent-zinc-300"
          />
          <span className="text-[12px] text-zinc-600 dark:text-zinc-300">
            Masquer les terminées
            {hiddenDoneCount > 0 && (
              <span className="text-zinc-400 dark:text-zinc-500 tabular-nums ml-1">
                ({hiddenDoneCount})
              </span>
            )}
          </span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setEditingTypes(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Gérer les types
          </button>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle mission
            </button>
          )}
          {(filterMission.size > 0 || filterFact.size > 0 || filterType !== "all") && (
            <button
              type="button"
              onClick={() => {
                setFilterMission(new Set());
                setFilterFact(new Set());
                setFilterType("all");
              }}
              className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* === Desktop : chips inline (cache mobile) === */}
      <div className="hidden md:flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0">
          {/* Mission : 4 etats fixes (a_demarrer / en_cours / livree / annulee) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400 mr-1 shrink-0">Mission</span>
            <StatusFilterChip
              label="Toutes"
              count={counts.total}
              active={filterMission.size === 0}
              onClick={() => setFilterMission(new Set())}
            />
            <StatusFilterChip
              label="À démarrer"
              count={counts.mission.a_demarrer}
              active={filterMission.has("a_demarrer")}
              onClick={(e) => setFilterMission(toggleFilterKey(filterMission, "a_demarrer", e))}
              accent="amber"
            />
            <StatusFilterChip
              label="En cours"
              count={counts.mission.en_cours}
              active={filterMission.has("en_cours")}
              onClick={(e) => setFilterMission(toggleFilterKey(filterMission, "en_cours", e))}
              accent="sky"
            />
            <StatusFilterChip
              label="Livrée"
              count={counts.mission.livree}
              active={filterMission.has("livree")}
              onClick={(e) => setFilterMission(toggleFilterKey(filterMission, "livree", e))}
              accent="emerald"
            />
            <StatusFilterChip
              label="Annulée"
              count={counts.mission.annulee}
              active={filterMission.has("annulee")}
              onClick={(e) => setFilterMission(toggleFilterKey(filterMission, "annulee", e))}
            />
          </div>

          {/* Facturation : 3 etats fixes */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400 mr-1 shrink-0">Facturation</span>
            <StatusFilterChip
              label="Toutes"
              count={counts.total}
              active={filterFact.size === 0}
              onClick={() => setFilterFact(new Set())}
            />
            <StatusFilterChip
              label="À facturer"
              count={counts.fact.a_facturer}
              active={filterFact.has("a_facturer")}
              onClick={(e) => setFilterFact(toggleFilterKey(filterFact, "a_facturer", e))}
              accent="amber"
            />
            <StatusFilterChip
              label="Facturée"
              count={counts.fact.facturee}
              active={filterFact.has("facturee")}
              onClick={(e) => setFilterFact(toggleFilterKey(filterFact, "facturee", e))}
              accent="emerald"
            />
            <StatusFilterChip
              label="Sans facture"
              count={counts.fact.sans_facture}
              active={filterFact.has("sans_facture")}
              onClick={(e) => setFilterFact(toggleFilterKey(filterFact, "sans_facture", e))}
            />
          </div>

          {/* Type : nombre variable d'options selon parametrage cabinet -> on
              garde un <select> compact pour eviter de saturer la toolbar avec
              une rangee de chips qui ferait potentiellement 10+ items. */}
          {(localTypes.filter((t) => t.actif).length > 0 || counts.typeNone > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400 shrink-0">Type</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterType)}
                className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-[12px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="all">Tous les types ({counts.total})</option>
                {localTypes
                  .filter((t) => t.actif)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({counts.type.get(t.id) ?? 0})
                    </option>
                  ))}
                {counts.typeNone > 0 && (
                  <option value="none">Sans type ({counts.typeNone})</option>
                )}
              </select>
            </div>
          )}

          {/* Toggle "Masquer terminees" : par defaut on cache les missions
              dont les 3 axes sont au stade terminal (Livree/Annulee +
              Facturee/Sans facture + Signee/N/A). Compteur sub-info pour
              indiquer combien sont masquees. */}
          <div className="flex items-center gap-2 flex-wrap">
            <label
              className="inline-flex items-center gap-2 cursor-pointer select-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
              title="Cache les missions ou il n'y a plus rien a faire (mission livree ou annulee + facturation cloturee + LDM signee ou non requise)"
            >
              <input
                type="checkbox"
                checked={hideDone}
                onChange={(e) => setHideDone(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-white/[0.15] accent-zinc-700 dark:accent-zinc-300"
              />
              <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                Masquer les terminées
                {hiddenDoneCount > 0 && (
                  <span className="text-zinc-400 dark:text-zinc-500 tabular-nums ml-1">
                    ({hiddenDoneCount})
                  </span>
                )}
              </span>
            </label>
            {(filterMission.size > 0 || filterFact.size > 0 || filterType !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setFilterMission(new Set());
                  setFilterFact(new Set());
                  setFilterType("all");
                }}
                className="self-start text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
              >
                Réinitialiser tous les filtres
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingTypes(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Gérer les types
          </button>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle mission
            </button>
          )}
        </div>
      </div>

      {adding && (
        <NewMissionForm
          types={localTypes.filter((t) => t.actif)}
          clientOptions={clientOptions}
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      {/* Modale gestion des types */}
      {editingTypes && (
        <TypesManagerModal
          types={localTypes}
          onTypesChange={setLocalTypes}
          onClose={() => {
            setEditingTypes(false);
            router.refresh();
          }}
        />
      )}

      {/* Table */}
      {filteredRows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          {localRows.length === 0
            ? "Aucune mission exceptionnelle. Clique sur « Nouvelle mission » pour commencer."
            : "Aucune mission ne correspond aux filtres actuels."}
        </div>
      ) : (
        <div
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
          className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card"
        >
          <table className="w-full text-sm min-w-[900px]" aria-label="Missions exceptionnelles">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <SortableHeader sortKey="client" align="left" width="180px" sort={sort} onSort={cycleSort}>Client</SortableHeader>
                <SortableHeader sortKey="type" align="left" width="140px" sort={sort} onSort={cycleSort}>Type</SortableHeader>
                <SortableHeader sortKey="mission" align="left" sort={sort} onSort={cycleSort}>Mission</SortableHeader>
                <SortableHeader sortKey="forfait" align="right" width="120px" sort={sort} onSort={cycleSort} title="Forfait d'honoraires (HT)">Forfait HT</SortableHeader>
                <SortableHeader sortKey="etat_mission" align="center" width="120px" sort={sort} onSort={cycleSort}>État mission</SortableHeader>
                <SortableHeader sortKey="facturation" align="center" width="120px" sort={sort} onSort={cycleSort}>Facturation</SortableHeader>
                <SortableHeader sortKey="ldm" align="center" width="140px" sort={sort} onSort={cycleSort} title="Lettre de mission">LDM</SortableHeader>
                <th scope="col" className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {filteredRows.map((r) => (
                <MissionRow
                  key={r.id}
                  row={r}
                  type={r.type_id ? typesById.get(r.type_id) ?? null : null}
                  types={localTypes.filter((t) => t.actif)}
                  clientOptions={clientOptions}
                  commentCount={commentCounts[r.id] ?? 0}
                  onSaveField={(field, value) => onSaveField(r.id, field, value)}
                  onChangeClient={(cid, libre) => onChangeClient(r.id, cid, libre)}
                  onSetEtatMission={(e) => onSetEtatMission(r.id, e)}
                  onSetEtatFacturation={(e) => onSetEtatFacturation(r.id, e)}
                  onSetLdmStatut={(s) => onSetLdmStatut(r.id, s)}
                  onSetType={(t) => onSetType(r.id, t)}
                  onOpenComments={(anchorRect) =>
                    setOpenCommentsFor({
                      missionId: r.id,
                      missionLabel: `${r.mission}${r.client_denomination ? ` · ${r.client_denomination}` : r.client_libre ? ` · ${r.client_libre}` : ""}`,
                      anchorRect,
                    })
                  }
                  onDuplicate={() => onDuplicate(r)}
                  onDelete={() => onDelete(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        {filteredRows.length} mission{filteredRows.length > 1 ? "s" : ""} affichée{filteredRows.length > 1 ? "s" : ""}
        {localRows.length !== filteredRows.length && ` sur ${localRows.length}`}
      </p>

      {/* Popover commentaires : ancre flottante a cote du bouton 💬 cliqué */}
      {openCommentsFor && (
        <MissionExcCommentsPopover
          missionId={openCommentsFor.missionId}
          missionLabel={openCommentsFor.missionLabel}
          currentUserEmail={currentUserEmail ?? null}
          anchorRect={openCommentsFor.anchorRect}
          onClose={() => setOpenCommentsFor(null)}
          onCountChange={(count) => {
            setCommentCounts((prev) => ({ ...prev, [openCommentsFor.missionId]: count }));
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
//  Recap KPI : 4 cards
// ============================================================================

function RecapCards({
  recap,
}: {
  recap: {
    total: number;
    en_cours: number;
    a_demarrer: number;
    livree: number;
    a_facturer: number;
    facturee: number;
    ca_a_facturer: number;
    ca_facture: number;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi
        label="En cours"
        value={String(recap.en_cours)}
        subtitle={recap.a_demarrer > 0 ? `+ ${recap.a_demarrer} à démarrer` : "-"}
        accent="sky"
      />
      <Kpi
        label="Livrées"
        value={String(recap.livree)}
        subtitle={`sur ${recap.total} mission${recap.total > 1 ? "s" : ""}`}
        accent="emerald"
      />
      <Kpi
        label="À facturer"
        value={formatEUR(recap.ca_a_facturer)}
        subtitle={`${recap.a_facturer} mission${recap.a_facturer > 1 ? "s" : ""}`}
        accent="amber"
      />
      <Kpi
        label="Facturé"
        value={formatEUR(recap.ca_facture)}
        subtitle={`${recap.facturee} mission${recap.facturee > 1 ? "s" : ""}`}
        accent="emerald"
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent: "sky" | "emerald" | "amber" | "zinc";
}) {
  const accents: Record<typeof accent, string> = {
    sky: "text-sky-700 dark:text-sky-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
        {label}
      </div>
      <div className={cn("text-lg font-semibold tabular-nums tracking-tight mt-0.5", accents[accent])}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate leading-snug">
        {subtitle}
      </div>
    </div>
  );
}

// ============================================================================
//  SortableHeader : <th> cliquable, cycle asc -> desc -> reset
// ============================================================================

type SortKeyExport = "client" | "type" | "mission" | "forfait" | "etat_mission" | "facturation" | "ldm";

function SortableHeader({
  sortKey,
  align,
  width,
  title,
  sort,
  onSort,
  children,
}: {
  sortKey: SortKeyExport;
  align: "left" | "center" | "right";
  width?: string;
  title?: string;
  sort: { key: SortKeyExport; dir: "asc" | "desc" } | null;
  onSort: (key: SortKeyExport) => void;
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  // Padding identique a l'ancien <th> + cell content alignment via flex
  const padCls = align === "left" ? "px-3 py-2" : "px-2 py-2";
  const justify =
    align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";
  return (
    <th
      scope="col"
      className={cn(padCls, "font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none")}
      style={width ? { width } : undefined}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 w-full",
          justify,
          active
            ? "text-zinc-900 dark:text-zinc-100"
            : "hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors",
        )}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{children}</span>
        <Icon
          className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-40")}
          aria-hidden
        />
      </button>
    </th>
  );
}

// ============================================================================
//  Une ligne du tableau
// ============================================================================

function MissionRow({
  row,
  type,
  types,
  clientOptions,
  commentCount,
  onSaveField,
  onChangeClient,
  onSetEtatMission,
  onSetEtatFacturation,
  onSetLdmStatut,
  onSetType,
  onOpenComments,
  onDuplicate,
  onDelete,
}: {
  row: MissionExcRow;
  type: MissionExcType | null;
  types: MissionExcType[];
  clientOptions: MissionExcClientOption[];
  /** Nombre de commentaires lies a cette mission (badge sur le bouton 💬). */
  commentCount: number;
  onSaveField: (field: keyof MissionExcRow, value: string | number | null) => void;
  onChangeClient: (clientId: string | null, libre: string | null) => void;
  onSetEtatMission: (e: EtatMission) => void;
  onSetEtatFacturation: (e: EtatFacturation | null) => void;
  onSetLdmStatut: (s: LdmStatutMission) => void;
  onSetType: (typeId: string | null) => void;
  /** Click sur 💬 : passe la position de l'ancre pour le popover. */
  onOpenComments: (anchorRect: { left: number; top: number; bottom: number; right: number }) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  // Pastille rouge tant que la mission n'est pas livree ou annulee.
  // Logique metier : une mission en cours n'est pas terminee, elle reste
  // a traiter (le user veut pas voir les en_cours comme "deja faites").
  const isAFaire = row.etat_mission === "a_demarrer" || row.etat_mission === "en_cours";
  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors align-top">
      {/* Client (+ pastille a faire en racine) */}
      <td className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          {isAFaire && (
            <span
              aria-label="À démarrer"
              title="Mission à démarrer"
              className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <ClientPicker
              row={row}
              clientOptions={clientOptions}
              onChange={onChangeClient}
            />
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-3 py-2.5">
        <TypePicker
          value={type}
          types={types}
          onChange={onSetType}
        />
      </td>

      {/* Mission + description */}
      <td className="px-3 py-2.5">
        <EditableText
          value={row.mission}
          placeholder="Intitulé mission"
          onSave={(v) => onSaveField("mission", v || row.mission)}
          className="font-medium text-zinc-900 dark:text-zinc-100"
          required
        />
        <EditableText
          value={row.description ?? ""}
          placeholder="Description (optionnel)"
          onSave={(v) => onSaveField("description", v || null)}
          multiline
          className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5"
        />
        {/* Date de debut editable inline (tri de la table = par date_debut DESC).
            Date de fin retiree de la vue pour eviter le bruit visuel. */}
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
          <span>📅</span>
          <EditableDate
            value={row.date_debut}
            placeholder="début…"
            onSave={(v) => onSaveField("date_debut", v)}
          />
        </div>
      </td>

      {/* Forfait (seul montant : durées + taux + montant calcule retires
          pour simplifier - cf demande Benjamin) */}
      <td className="px-2 py-2.5 text-right">
        <EditableNumber
          value={row.forfait}
          suffix="€ HT"
          step={50}
          onSave={(v) => onSaveField("forfait", v)}
        />
      </td>

      {/* Etat mission */}
      <td className="px-2 py-2.5 text-center">
        <Picker
          value={row.etat_mission}
          options={ETAT_MISSION_OPTIONS}
          onChange={(v) => onSetEtatMission(v as EtatMission)}
        />
      </td>

      {/* Etat facturation : tiret tant que la mission n'est pas livree.
          Auto-set a "À facturer" au passage en "livree" (trigger DB + UI).
          Bouton "Reinitialiser" pour revider la cellule. */}
      <td className="px-2 py-2.5 text-center">
        <Picker
          value={row.etat_facturation}
          options={ETAT_FACTURATION_OPTIONS}
          onChange={(v) => onSetEtatFacturation(v as EtatFacturation)}
          onReset={() => onSetEtatFacturation(null)}
          allowEmpty
          placeholderTitle="Facturation non encore définie"
        />
      </td>

      {/* LDM (Lettre de mission) : a faire / N/A / Envoyee / Signee */}
      <td className="px-2 py-2.5 text-center">
        <Picker
          value={row.ldm_statut}
          options={LDM_STATUT_OPTIONS}
          onChange={(v) => onSetLdmStatut(v as LdmStatutMission)}
        />
      </td>

      {/* Actions : commentaires + dupliquer + supprimer */}
      <td className="px-2 py-2.5 text-right">
        <div className="inline-flex items-center gap-0.5">
        <button
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpenComments({
              left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right,
            });
          }}
          className={cn(
            "relative p-1 rounded transition-colors",
            commentCount > 0
              ? "text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/15"
              : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
          )}
          aria-label={commentCount > 0 ? `${commentCount} commentaires` : "Ajouter un commentaire"}
          title={commentCount > 0 ? `${commentCount} commentaire${commentCount > 1 ? "s" : ""}` : "Ajouter un commentaire"}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {commentCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-[hsl(var(--gold))] text-[9px] font-semibold text-white tabular-nums leading-none">
              {commentCount}
            </span>
          )}
        </button>
        <button
          onClick={onDuplicate}
          className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
          aria-label="Dupliquer la mission"
          title="Dupliquer"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          aria-label="Supprimer la mission"
          title="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
//  EditableText : champ texte inline (single ou multi-line)
// ============================================================================

function EditableText({
  value,
  placeholder,
  onSave,
  multiline,
  className,
  required,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  className?: string;
  required?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  function commit() {
    setEditing(false);
    const trimmed = local.trim();
    if (required && !trimmed) {
      // Reset
      setLocal(value);
      return;
    }
    if (trimmed !== value) {
      onSave(trimmed);
    }
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          autoFocus
          rows={2}
          placeholder={placeholder}
          className={cn(
            "w-full px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none",
            className
          )}
        />
      );
    }
    return (
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setLocal(value);
            setEditing(false);
          }
        }}
        autoFocus
        placeholder={placeholder}
        className={cn(
          "w-full px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-zinc-400",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "w-full text-left -mx-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors block min-h-[1.25rem]",
        className,
        !value && "text-zinc-400 dark:text-zinc-500 italic"
      )}
    >
      {value || placeholder}
    </button>
  );
}

// ============================================================================
//  EditableDate : champ date inline. Affiche la date formatee (JJ/MM/AAAA)
//  par defaut, switch en input[type=date] au clic. Vide -> placeholder.
// ============================================================================

function EditableDate({
  value,
  placeholder,
  onSave,
  className,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => setLocal(value ?? ""), [value]);

  function commit() {
    setEditing(false);
    const v = local.trim();
    const next = v === "" ? null : v;
    if (next !== value) onSave(next);
  }

  if (editing) {
    return (
      <input
        type="date"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value ?? "");
            setEditing(false);
          }
        }}
        autoFocus
        className={cn(
          "px-1 py-0 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] text-[10px] tabular-nums focus:outline-none focus:ring-1 focus:ring-zinc-400",
          className
        )}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors",
        value ? "" : "italic",
        className
      )}
    >
      {value ? formatDate(value) : placeholder}
    </button>
  );
}

// ============================================================================
//  EditableNumber : champ numerique avec suffixe (h / €)
// ============================================================================

function EditableNumber({
  value,
  suffix,
  step,
  onSave,
}: {
  value: number | null;
  suffix: string;
  step?: number;
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
    if (Number.isNaN(n)) {
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
        step={step}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
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
          ? "text-zinc-300 dark:text-zinc-600 italic"
          : "text-zinc-900 dark:text-zinc-100"
      )}
    >
      {value === null ? "-" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} ${suffix}`}
    </button>
  );
}

// ============================================================================
//  ClientPicker : choix entre client EC existant ou texte libre
// ============================================================================

function ClientPicker({
  row,
  clientOptions,
  onChange,
}: {
  row: MissionExcRow;
  clientOptions: MissionExcClientOption[];
  onChange: (clientId: string | null, libre: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingLibre, setEditingLibre] = useState(false);
  const [libreInput, setLibreInput] = useState(row.client_libre ?? "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => setLibreInput(row.client_libre ?? ""), [row.client_libre]);

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = 360;
    const POPOVER_WIDTH = 300;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientOptions.slice(0, 12);
    return clientOptions
      .filter((c) => c.denomination.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, clientOptions]);

  if (editingLibre) {
    return (
      <input
        type="text"
        value={libreInput}
        onChange={(e) => setLibreInput(e.target.value)}
        onBlur={() => {
          setEditingLibre(false);
          const v = libreInput.trim();
          if (v !== (row.client_libre ?? "")) {
            onChange(null, v || null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setLibreInput(row.client_libre ?? "");
            setEditingLibre(false);
          }
        }}
        autoFocus
        placeholder="Nom libre…"
        className="w-full px-1.5 py-0.5 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
      />
    );
  }

  return (
    <div className="inline-block w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left -mx-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
      >
        {row.client_id && row.client_denomination ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {row.client_denomination}
            </span>
            {row.client_slug && (
              <Link
                href={`/clients/${row.client_slug}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
                title="Ouvrir la fiche client"
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        ) : row.client_libre ? (
          <span className="text-zinc-700 dark:text-zinc-300 italic truncate block">
            {row.client_libre}
          </span>
        ) : (
          <span className="text-zinc-400 dark:text-zinc-500 italic">- Choisir</span>
        )}
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
            className="min-w-[300px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                placeholder="Rechercher un client EC…"
                className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-400 italic">Aucun résultat</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id, null);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                      row.client_id === c.id && "bg-zinc-50 dark:bg-white/[0.04]"
                    )}
                  >
                    <span className="truncate flex-1">{c.denomination}</span>
                    {row.client_id === c.id && (
                      <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-zinc-100 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditingLibre(true);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors flex items-center gap-2"
              >
                <Pencil className="h-3 w-3" />
                Saisir un nom libre…
              </button>
              {(row.client_id || row.client_libre) && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
                >
                  Retirer le client
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  TypePicker : choix d'un type depuis le referentiel editable
// ============================================================================

function TypePicker({
  value,
  types,
  onChange,
}: {
  value: MissionExcType | null;
  types: MissionExcType[];
  onChange: (typeId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = Math.min(300, types.length * 28 + 60);
    const POPOVER_WIDTH = 220;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open, types.length]);

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
    <div className="inline-block max-w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 max-w-full",
          value
            ? colorForType(value.slug)
            : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{value?.label ?? "- Type"}</span>
        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
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
            className="min-w-[220px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            <div className="max-h-[260px] overflow-y-auto py-1">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onChange(t.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                    value?.id === t.id && "bg-zinc-50 dark:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border truncate", colorForType(t.slug))}>
                    {t.label}
                  </span>
                  {value?.id === t.id && (
                    <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 shrink-0 ml-auto" />
                  )}
                </button>
              ))}
            </div>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
              >
                Retirer le type
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// (BadgePicker remplace par <Picker> partage de @/app/_components/picker)
// (FilterSelect retire : remplace par StatusFilterChip cf. toolbar ci-dessus)

// ============================================================================
//  NewMissionForm : creation rapide
// ============================================================================

function NewMissionForm({
  types,
  clientOptions,
  onCancel,
  onCreated,
}: {
  types: MissionExcType[];
  clientOptions: MissionExcClientOption[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [mission, setMission] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientLibre, setClientLibre] = useState("");
  const initialType = types[0] ?? null;
  const [typeId, setTypeId] = useState<string | null>(initialType?.id ?? null);
  // Forfait pre-rempli avec le tarif du type courant. A chaque changement de
  // type, on synchronise sur le tarif du nouveau type (sauf si l'utilisateur
  // a explicitement modifie le forfait depuis le dernier changement de type).
  const [forfait, setForfait] = useState(
    initialType?.tarif ? String(initialType.tarif) : "",
  );
  // Tracker si l'utilisateur a touche au forfait manuellement -> on arrete
  // d'auto-synchroniser pour ne pas ecraser sa saisie.
  const [forfaitTouched, setForfaitTouched] = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onChangeType(nextId: string | null) {
    setTypeId(nextId);
    if (!forfaitTouched) {
      const t = nextId ? types.find((x) => x.id === nextId) : null;
      setForfait(t?.tarif ? String(t.tarif) : "");
    }
  }

  function submit() {
    if (!mission.trim()) {
      setError("Mission obligatoire");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createMission({
          mission,
          client_id: clientId || null,
          client_libre: clientId ? null : clientLibre || null,
          type_id: typeId,
          forfait: forfait ? Number(forfait.replace(",", ".")) : null,
          date_debut: dateDebut || null,
        });
        toastSuccess("Mission créée");
        onCreated();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastError(e, "Echec création");
      }
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4 shadow-card space-y-3">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Nouvelle mission exceptionnelle
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="Intitulé de la mission *"
          autoFocus
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm sm:col-span-2"
        />

        <select
          value={typeId ?? ""}
          onChange={(e) => onChangeType(e.target.value || null)}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        >
          <option value="">- Type -</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.tarif > 0 ? ` · ${t.tarif} €` : ""}
            </option>
          ))}
        </select>

        <select
          value={clientId ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            setClientId(v);
            if (v) setClientLibre("");
          }}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        >
          <option value="">- Client EC (optionnel) -</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.denomination}
            </option>
          ))}
        </select>

        {!clientId && (
          <input
            value={clientLibre}
            onChange={(e) => setClientLibre(e.target.value)}
            placeholder="Ou nom libre (prospect, contact ponctuel…)"
            className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm sm:col-span-2"
          />
        )}

        <input
          value={forfait}
          onChange={(e) => {
            setForfait(e.target.value);
            setForfaitTouched(true);
          }}
          type="number"
          step="50"
          placeholder="Forfait d'honoraires (€ HT)"
          title="Pré-rempli avec le tarif du type, modifiable librement"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums"
        />
        <input
          value={dateDebut}
          onChange={(e) => setDateDebut(e.target.value)}
          type="date"
          placeholder="Date de début"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
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
          disabled={isPending || !mission.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Création…" : "Créer"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
//  TypesManagerModal : CRUD inline des types
// ============================================================================

/** Input numerique pour le tarif d'un type. State local pour ne pas
 *  declencher de re-render parent a chaque keystroke. Commit au blur
 *  ou Entree. */
function TarifInput({
  initialValue,
  onCommit,
}: {
  initialValue: number;
  onCommit: (raw: string) => void;
}) {
  const [val, setVal] = useState(initialValue ? String(initialValue) : "");
  // Sync si la valeur change de l'exterieur (ex. optimistic update revert)
  useEffect(() => {
    setVal(initialValue ? String(initialValue) : "");
  }, [initialValue]);
  return (
    <div className="flex items-center gap-1 px-1.5 py-0 rounded border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] w-[100px]">
      <input
        type="number"
        min={0}
        step={50}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onCommit(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="0"
        className="w-full px-1 py-1 text-xs tabular-nums bg-transparent focus:outline-none text-zinc-800 dark:text-zinc-200"
        title="Tarif par défaut (forfait HT) pour ce type"
      />
      <span className="text-[9px] text-zinc-400 dark:text-zinc-500 shrink-0">€</span>
    </div>
  );
}

function TypesManagerModal({
  types,
  onTypesChange,
  onClose,
}: {
  types: MissionExcType[];
  onTypesChange: (next: MissionExcType[]) => void;
  onClose: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newTarif, setNewTarif] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function parseTarif(raw: string): number {
    const n = parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function addType() {
    const lbl = newLabel.trim();
    if (!lbl) return;
    const tarif = parseTarif(newTarif);
    setNewLabel("");
    setNewTarif("");
    startTransition(async () => {
      try {
        const created = await createMissionType(lbl, tarif);
        // Server ne retourne pas tarif si migration 0067 pas appliquee
        onTypesChange([...types, { ...created, tarif: (created as { tarif?: number }).tarif ?? tarif } as MissionExcType]);
        toastSuccess("Type ajouté");
      } catch (e) {
        toastError(e, "Echec création type");
      }
    });
  }

  function startEdit(t: MissionExcType) {
    setEditingId(t.id);
    setEditLabel(t.label);
  }

  function commitEdit(t: MissionExcType) {
    const lbl = editLabel.trim();
    setEditingId(null);
    if (!lbl || lbl === t.label) return;
    onTypesChange(types.map((x) => (x.id === t.id ? { ...x, label: lbl } : x)));
    startTransition(async () => {
      try {
        await renameMissionType(t.id, lbl);
      } catch (e) {
        toastError(e, "Echec renommage");
      }
    });
  }

  function commitTarif(t: MissionExcType, raw: string) {
    const tarif = parseTarif(raw);
    if (tarif === t.tarif) return;
    onTypesChange(types.map((x) => (x.id === t.id ? { ...x, tarif } : x)));
    startTransition(async () => {
      try {
        await setMissionTypeTarif(t.id, tarif);
      } catch (e) {
        toastError(e, "Echec mise à jour tarif");
      }
    });
  }

  function toggleActif(t: MissionExcType) {
    const next = !t.actif;
    onTypesChange(types.map((x) => (x.id === t.id ? { ...x, actif: next } : x)));
    startTransition(async () => {
      try {
        await setMissionTypeActif(t.id, next);
      } catch (e) {
        toastError(e, "Echec mise à jour");
      }
    });
  }

  async function removeType(t: MissionExcType) {
    const ok = await confirm({
      title: `Supprimer « ${t.label} » ?`,
      description: "Le type sera supprimé définitivement. Pour le masquer sans supprimer, utilise plutôt l'interrupteur Actif/Inactif.",
      variant: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await deleteMissionType(t.id);
      onTypesChange(types.filter((x) => x.id !== t.id));
      toastSuccess("Type supprimé");
    } catch (e) {
      toastError(e, "Echec suppression");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Gestion des types de mission"
    >
      {ConfirmDialog}
      <div
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Types de mission
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Ajout : libelle + tarif (forfait HT par defaut) */}
          <div className="flex items-stretch gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addType();
              }}
              placeholder="Nouveau type (ex. Restructuration)…"
              className="flex-1 px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
            />
            <div className="flex items-center gap-1 px-2 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] w-[120px]">
              <input
                type="number"
                min={0}
                step={50}
                value={newTarif}
                onChange={(e) => setNewTarif(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addType();
                }}
                placeholder="0"
                className="w-full px-1 py-1.5 text-sm tabular-nums bg-transparent focus:outline-none"
                title="Tarif par défaut (forfait HT) pour ce type"
              />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">€ HT</span>
            </div>
            <button
              type="button"
              onClick={addType}
              disabled={!newLabel.trim()}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>

          {/* Liste */}
          <ul className="space-y-1">
            {types.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors",
                  !t.actif && "opacity-50"
                )}
              >
                {editingId === t.id ? (
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => commitEdit(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(t);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.06] text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="flex-1 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {t.label}
                  </button>
                )}
                {/* Tarif : edition inline directe (blur ou Entree -> sauvegarde) */}
                <TarifInput
                  initialValue={t.tarif}
                  onCommit={(raw) => commitTarif(t, raw)}
                />
                <button
                  type="button"
                  onClick={() => toggleActif(t)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium border transition-colors",
                    t.actif
                      ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
                      : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.08]"
                  )}
                >
                  {t.actif ? "Actif" : "Inactif"}
                </button>
                <button
                  type="button"
                  onClick={() => removeType(t)}
                  className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                  aria-label={`Supprimer ${t.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Astuce : passe un type en « Inactif » pour le masquer des nouveaux choix tout en gardant l&apos;historique des missions qui l&apos;utilisent.
          </p>
        </div>

        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
