"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Settings,
  Check,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useConfirm } from "@/app/_components/confirm-modal";
import {
  createMission,
  createMissionType,
  deleteMission,
  deleteMissionType,
  renameMissionType,
  setEtatFacturation,
  setEtatMission,
  setMissionTypeActif,
  updateMission,
  type EtatFacturation,
  type EtatMission,
} from "./actions";

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
  etat_facturation: EtatFacturation;
  date_debut: string | null;
  date_fin: string | null;
};

export type MissionExcType = {
  id: string;
  slug: string;
  label: string;
  ordre: number;
  actif: boolean;
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
      "bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/[0.12]",
  },
  {
    key: "en_cours",
    label: "En cours",
    color:
      "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "livree",
    label: "Livrée",
    color:
      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  },
  {
    key: "annulee",
    label: "Annulée",
    color:
      "bg-zinc-50 dark:bg-white/[0.03] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.08] line-through",
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
      "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  },
  {
    key: "facturee",
    label: "Facturée",
    color:
      "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "payee",
    label: "Payée",
    color:
      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  },
  {
    key: "sans_facture",
    label: "Sans facture",
    color:
      "bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.08]",
  },
];

// ============================================================================
//  Helpers de formatage
// ============================================================================

function formatEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return (
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 0,
    }).format(Math.round(n)) + " €"
  );
}

function formatHours(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return (
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 1,
    }).format(n) + " h"
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // ISO YYYY-MM-DD → JJ/MM/AAAA
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Calcule un montant indicatif : forfait si renseigne, sinon taux*reel, sinon taux*theorique. */
function computeMontant(r: MissionExcRow): { value: number | null; source: "forfait" | "reel" | "theorique" | null } {
  if (r.forfait !== null && r.forfait !== undefined) {
    return { value: r.forfait, source: "forfait" };
  }
  if (r.taux_horaire !== null && r.taux_horaire !== undefined) {
    if (r.duree_reelle_h !== null && r.duree_reelle_h !== undefined) {
      return { value: r.taux_horaire * r.duree_reelle_h, source: "reel" };
    }
    if (r.duree_theorique_h !== null && r.duree_theorique_h !== undefined) {
      return { value: r.taux_horaire * r.duree_theorique_h, source: "theorique" };
    }
  }
  return { value: null, source: null };
}

// ============================================================================
//  Composant principal
// ============================================================================

type FilterMission = "all" | EtatMission;
type FilterFact = "all" | EtatFacturation;

export default function MissionExcTable({
  rows,
  types,
  clientOptions,
}: {
  rows: MissionExcRow[];
  types: MissionExcType[];
  clientOptions: MissionExcClientOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  const [localTypes, setLocalTypes] = useState(types);
  const [adding, setAdding] = useState(false);
  const [editingTypes, setEditingTypes] = useState(false);
  const [filterMission, setFilterMission] = useState<FilterMission>("all");
  const [filterFact, setFilterFact] = useState<FilterFact>("all");

  useEffect(() => setLocalRows(rows), [rows]);
  useEffect(() => setLocalTypes(types), [types]);
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
      payee: 0,
      // CA potentiel/realise
      ca_a_facturer: 0,
      ca_facture_non_paye: 0,
      ca_paye: 0,
      heures_reelles_total: 0,
    };
    for (const row of localRows) {
      if (row.etat_mission === "en_cours") r.en_cours++;
      if (row.etat_mission === "a_demarrer") r.a_demarrer++;
      if (row.etat_mission === "livree") r.livree++;
      if (row.etat_facturation === "a_facturer") r.a_facturer++;
      if (row.etat_facturation === "facturee") r.facturee++;
      if (row.etat_facturation === "payee") r.payee++;
      const m = computeMontant(row).value ?? 0;
      if (row.etat_mission !== "annulee") {
        if (row.etat_facturation === "a_facturer") r.ca_a_facturer += m;
        if (row.etat_facturation === "facturee") r.ca_facture_non_paye += m;
        if (row.etat_facturation === "payee") r.ca_paye += m;
      }
      if (row.duree_reelle_h) r.heures_reelles_total += row.duree_reelle_h;
    }
    return r;
  }, [localRows]);

  // ============================================================================
  //  Filtrage
  // ============================================================================
  const filteredRows = useMemo(() => {
    return localRows.filter((r) => {
      if (filterMission !== "all" && r.etat_mission !== filterMission) return false;
      if (filterFact !== "all" && r.etat_facturation !== filterFact) return false;
      return true;
    });
  }, [localRows, filterMission, filterFact]);

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
    patchRow(id, { etat_mission: etat });
    startTransition(async () => {
      try {
        await setEtatMission(id, etat);
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onSetEtatFacturation(id: string, etat: EtatFacturation) {
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

  async function onDelete(row: MissionExcRow) {
    const ok = await confirm({
      title: `Supprimer cette mission ?`,
      description: `« ${row.mission} » pour ${row.client_denomination ?? row.client_libre ?? "—"}. Cette action est irréversible.`,
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
    <div className="space-y-4">
      {ConfirmDialog}

      {/* Recap KPI */}
      <RecapCards recap={recap} />

      {/* Toolbar : filtres + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect
            label="Mission"
            value={filterMission}
            onChange={(v) => setFilterMission(v as FilterMission)}
            options={[
              { key: "all", label: "Tous les états" },
              ...ETAT_MISSION_OPTIONS.map((o) => ({ key: o.key, label: o.label })),
            ]}
          />
          <FilterSelect
            label="Facturation"
            value={filterFact}
            onChange={(v) => setFilterFact(v as FilterFact)}
            options={[
              { key: "all", label: "Toutes" },
              ...ETAT_FACTURATION_OPTIONS.map((o) => ({ key: o.key, label: o.label })),
            ]}
          />
          {(filterMission !== "all" || filterFact !== "all") && (
            <button
              type="button"
              onClick={() => {
                setFilterMission("all");
                setFilterFact("all");
              }}
              className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Réinitialiser
            </button>
          )}
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
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 shadow-card">
          {localRows.length === 0
            ? "Aucune mission exceptionnelle. Clique sur « Nouvelle mission » pour commencer."
            : "Aucune mission ne correspond aux filtres actuels."}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto shadow-card">
          <table className="w-full text-sm min-w-[1200px]" aria-label="Missions exceptionnelles">
            <thead className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[200px]">Client</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[140px]">Type</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-xs text-zinc-600 dark:text-zinc-400">Mission</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[80px]" title="Durée théorique">Théo.</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[80px]" title="Durée réelle">Réel</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[90px]" title="Taux horaire">Taux</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[100px]" title="Prix théorique = durée théorique × taux horaire">Théo. €</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[90px]" title="Forfait d'honoraires">Forfait</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[90px]" title="Montant à facturer (forfait si présent, sinon taux × heures réelles, sinon taux × heures théoriques)">À facturer</th>
                <th scope="col" className="px-2 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[120px]">État mission</th>
                <th scope="col" className="px-2 py-2.5 text-center font-medium text-xs text-zinc-600 dark:text-zinc-400 w-[120px]">Facturation</th>
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
                  onSaveField={(field, value) => onSaveField(r.id, field, value)}
                  onChangeClient={(cid, libre) => onChangeClient(r.id, cid, libre)}
                  onSetEtatMission={(e) => onSetEtatMission(r.id, e)}
                  onSetEtatFacturation={(e) => onSetEtatFacturation(r.id, e)}
                  onSetType={(t) => onSetType(r.id, t)}
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
        {recap.heures_reelles_total > 0 && ` · ${formatHours(recap.heures_reelles_total)} cumulées`}
      </p>
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
    payee: number;
    ca_a_facturer: number;
    ca_facture_non_paye: number;
    ca_paye: number;
    heures_reelles_total: number;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi
        label="En cours"
        value={String(recap.en_cours)}
        subtitle={recap.a_demarrer > 0 ? `+ ${recap.a_demarrer} à démarrer` : "—"}
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
        label="Facturé non payé"
        value={formatEUR(recap.ca_facture_non_paye)}
        subtitle={recap.ca_paye > 0 ? `${formatEUR(recap.ca_paye)} déjà payés` : "—"}
        accent="sky"
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
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-3 shadow-card">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
        {label}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums mt-1", accents[accent])}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
        {subtitle}
      </div>
    </div>
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
  onSaveField,
  onChangeClient,
  onSetEtatMission,
  onSetEtatFacturation,
  onSetType,
  onDelete,
}: {
  row: MissionExcRow;
  type: MissionExcType | null;
  types: MissionExcType[];
  clientOptions: MissionExcClientOption[];
  onSaveField: (field: keyof MissionExcRow, value: string | number | null) => void;
  onChangeClient: (clientId: string | null, libre: string | null) => void;
  onSetEtatMission: (e: EtatMission) => void;
  onSetEtatFacturation: (e: EtatFacturation) => void;
  onSetType: (typeId: string | null) => void;
  onDelete: () => void;
}) {
  const montant = computeMontant(row);

  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors align-top">
      {/* Client */}
      <td className="px-3 py-2.5">
        <ClientPicker
          row={row}
          clientOptions={clientOptions}
          onChange={onChangeClient}
        />
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
        {(row.date_debut || row.date_fin) && (
          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
            {row.date_debut && <span>📅 {formatDate(row.date_debut)}</span>}
            {row.date_fin && <span>→ {formatDate(row.date_fin)}</span>}
          </div>
        )}
      </td>

      {/* Durée théorique */}
      <td className="px-2 py-2.5 text-right">
        <EditableNumber
          value={row.duree_theorique_h}
          suffix="h"
          step={0.5}
          onSave={(v) => onSaveField("duree_theorique_h", v)}
        />
      </td>

      {/* Durée réelle */}
      <td className="px-2 py-2.5 text-right">
        <EditableNumber
          value={row.duree_reelle_h}
          suffix="h"
          step={0.5}
          onSave={(v) => onSaveField("duree_reelle_h", v)}
        />
      </td>

      {/* Taux horaire */}
      <td className="px-2 py-2.5 text-right">
        <EditableNumber
          value={row.taux_horaire}
          suffix="€"
          step={5}
          onSave={(v) => onSaveField("taux_horaire", v)}
        />
      </td>

      {/* Prix theorique calcule = duree theorique x taux horaire (read-only) */}
      <td className="px-2 py-2.5 text-right">
        <PriceComputedCell
          duree={row.duree_theorique_h}
          taux={row.taux_horaire}
        />
      </td>

      {/* Forfait */}
      <td className="px-2 py-2.5 text-right">
        <EditableNumber
          value={row.forfait}
          suffix="€"
          step={50}
          onSave={(v) => onSaveField("forfait", v)}
        />
      </td>

      {/* Montant a facturer (priorite : forfait > taux x reel > taux x theo) */}
      <td className="px-2 py-2.5 text-right">
        <div className="inline-flex flex-col items-end">
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              montant.value === null
                ? "text-zinc-400 dark:text-zinc-500"
                : "text-zinc-900 dark:text-zinc-100"
            )}
          >
            {formatEUR(montant.value)}
          </span>
          {montant.source && (
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
              {montant.source === "forfait"
                ? "forfait"
                : montant.source === "reel"
                ? "taux × réel"
                : "taux × théo."}
            </span>
          )}
        </div>
      </td>

      {/* Etat mission */}
      <td className="px-2 py-2.5 text-center">
        <BadgePicker
          value={row.etat_mission}
          options={ETAT_MISSION_OPTIONS}
          onChange={(v) => onSetEtatMission(v as EtatMission)}
        />
      </td>

      {/* Etat facturation */}
      <td className="px-2 py-2.5 text-center">
        <BadgePicker
          value={row.etat_facturation}
          options={ETAT_FACTURATION_OPTIONS}
          onChange={(v) => onSetEtatFacturation(v as EtatFacturation)}
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-2.5 text-right">
        <button
          onClick={onDelete}
          className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          aria-label="Supprimer la mission"
          title="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
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
//  PriceComputedCell : cellule read-only affichant durée × taux
// ============================================================================

function PriceComputedCell({
  duree,
  taux,
}: {
  duree: number | null;
  taux: number | null;
}) {
  const computable =
    duree !== null && duree !== undefined && taux !== null && taux !== undefined;
  const value = computable ? (duree as number) * (taux as number) : null;
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 tabular-nums text-sm",
        computable
          ? "text-violet-700 dark:text-violet-300 font-medium"
          : "text-zinc-300 dark:text-zinc-600 italic"
      )}
      title={
        computable
          ? `${duree} h × ${taux} € = ${formatEUR(value)}`
          : "Renseigne durée théorique + taux horaire pour calculer"
      }
    >
      {formatEUR(value)}
    </span>
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
      {value === null ? "—" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} ${suffix}`}
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
          <span className="text-zinc-400 dark:text-zinc-500 italic">— Choisir</span>
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
            className="min-w-[300px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.04] overflow-hidden animate-slide-up-fade"
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
            ? "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30"
            : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{value?.label ?? "— Type"}</span>
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
            className="min-w-[220px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.04] overflow-hidden animate-slide-up-fade"
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
                  <span className="truncate flex-1">{t.label}</span>
                  {value?.id === t.id && (
                    <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 shrink-0" />
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

// ============================================================================
//  BadgePicker : picker generique pour Etat mission / facturation
// ============================================================================

function BadgePicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ key: T; label: string; color: string }>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = options.find((o) => o.key === value) ?? options[0];

  // Positionne le popover via getBoundingClientRect + createPortal pour echapper
  // le clipping de la table (overflow-x-auto + rounded-xl).
  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = options.length * 32 + 16;
    const POPOVER_WIDTH = 180;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    // Aligne le bord droit du popover sur le bord droit du bouton (ces pickers
    // sont dans les colonnes de droite, donc on evite l'overflow horizontal).
    const desiredLeft = rect.right - POPOVER_WIDTH;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open, options.length]);

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
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 whitespace-nowrap",
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
            className="min-w-[180px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.04] overflow-hidden animate-slide-up-fade"
          >
            {options.map((o) => (
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
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                  {o.label}
                </span>
                {value === o.key && (
                  <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 ml-auto" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  FilterSelect : petit select pour la toolbar
// ============================================================================

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
      <span>{label} :</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  const [typeId, setTypeId] = useState<string | null>(types[0]?.id ?? null);
  const [dureeTheo, setDureeTheo] = useState("");
  const [taux, setTaux] = useState("");
  const [forfait, setForfait] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
          duree_theorique_h: dureeTheo ? Number(dureeTheo.replace(",", ".")) : null,
          taux_horaire: taux ? Number(taux.replace(",", ".")) : null,
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
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-4 shadow-card space-y-3">
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
          onChange={(e) => setTypeId(e.target.value || null)}
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
        >
          <option value="">— Type —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
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
          <option value="">— Client EC (optionnel) —</option>
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
          value={dureeTheo}
          onChange={(e) => setDureeTheo(e.target.value)}
          type="number"
          step="0.5"
          placeholder="Durée théorique (h)"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums"
        />
        <input
          value={taux}
          onChange={(e) => setTaux(e.target.value)}
          type="number"
          step="5"
          placeholder="Taux horaire (€)"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm tabular-nums"
        />
        <input
          value={forfait}
          onChange={(e) => setForfait(e.target.value)}
          type="number"
          step="50"
          placeholder="Forfait d'honoraires (€)"
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function addType() {
    const lbl = newLabel.trim();
    if (!lbl) return;
    setNewLabel("");
    startTransition(async () => {
      try {
        const created = await createMissionType(lbl);
        onTypesChange([...types, created]);
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
          {/* Ajout */}
          <div className="flex items-center gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addType();
              }}
              placeholder="Nouveau type (ex. Restructuration)…"
              className="flex-1 px-2 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm"
            />
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
