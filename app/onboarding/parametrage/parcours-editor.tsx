"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  FolderPlus,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/app/_components/confirm-modal";
import {
  createEtape,
  createRubrique,
  deleteEtape,
  deleteRubrique,
  moveEtape,
  reorderRubriques,
  updateEtape,
  updateEtapeConditions,
  updateRubrique,
} from "./actions";
import {
  COMBINATOR_LABEL,
  FIELD_LABEL,
  OP_LABEL,
  normalize,
  type Combinator,
  type ConditionField,
  type ConditionItem,
  type ConditionOp,
  type ConditionsNa,
} from "../parcours-engine";
import { formatNumber, type NumberingStyle } from "./numbering";

// ============================================================================
//  TYPES
// ============================================================================

export type EtapeRow = {
  id: string;
  task_key: string;
  libelle: string;
  nom_court: string;
  description: string | null;
  ordre: number;
  categorie: string | null;
  rubrique_id: string | null;
  // Tolérant : nouveau format (objet) ou legacy (array). normalize() fait la conversion.
  conditions_na: unknown;
};

export type RubriqueRow = {
  id: string;
  nom: string;
  ordre: number;
  numbering_style: NumberingStyle;
  numbering_reset: boolean;
};

/** Container utilisé par le DnD (rubrique ou "sans rubrique"). */
type ContainerId = string; // soit un rubrique.id, soit la chaîne "no-rub"
const NO_RUB: ContainerId = "no-rub";

// ============================================================================
//  COMPOSANT PRINCIPAL
// ============================================================================

export default function ParcoursEditor({
  parcoursId,
  rubriques,
  etapes,
}: {
  parcoursId: string;
  rubriques: RubriqueRow[];
  etapes: EtapeRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [expandedEtapeId, setExpandedEtapeId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // State local + sync via prop pour conserver l'UI immédiate pendant le save
  const [localEtapes, setLocalEtapes] = useState<EtapeRow[]>(etapes);
  const [localRubriques, setLocalRubriques] = useState<RubriqueRow[]>(rubriques);

  // Resync quand les props serveur changent (post-router.refresh)
  if (etapes !== localEtapes && etapes.length !== localEtapes.length) {
    setLocalEtapes(etapes);
  }
  if (rubriques !== localRubriques && rubriques.length !== localRubriques.length) {
    setLocalRubriques(rubriques);
  }

  function refresh() {
    router.refresh();
  }

  // -------- Numérotation : précalcul du numéro affiché pour chaque étape --------
  const numbering = useMemo(() => {
    return computeNumbering(localRubriques, localEtapes);
  }, [localRubriques, localEtapes]);

  // -------- Groupement étapes par container --------
  const etapesByContainer = useMemo(() => {
    const map = new Map<ContainerId, EtapeRow[]>();
    map.set(NO_RUB, []);
    for (const r of localRubriques) map.set(r.id, []);
    for (const e of localEtapes) {
      const cid = e.rubrique_id ?? NO_RUB;
      const arr = map.get(cid);
      if (arr) arr.push(e);
    }
    // Trie chaque container par ordre
    for (const arr of map.values()) arr.sort((a, b) => a.ordre - b.ordre);
    return map;
  }, [localEtapes, localRubriques]);

  // -------- DnD setup --------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /**
   * Collision custom : on regarde d'abord les containers sous le pointeur
   * (rubriques + "sans rubrique"), puis on fallback sur rectIntersection
   * pour viser les items individuels au sein du container.
   *
   * Sans ça, dropper sur une rubrique vide ne déclenchait aucune collision.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const inside = pointerWithin(args);
    if (inside.length > 0) return inside;
    return rectIntersection(args);
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeEtape = useMemo(
    () => localEtapes.find((e) => e.id === activeId) ?? null,
    [activeId, localEtapes]
  );

  function findContainer(id: string): ContainerId | null {
    if (id === NO_RUB) return NO_RUB;
    if (localRubriques.find((r) => r.id === id)) return id;
    const etape = localEtapes.find((e) => e.id === id);
    if (etape) return etape.rubrique_id ?? NO_RUB;
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const fromContainer = findContainer(activeId);
    const toContainer = findContainer(overId);
    if (!fromContainer || !toContainer) return;

    // Liste des étapes du container destination
    const targetList = etapesByContainer.get(toContainer) ?? [];
    // Si on a déposé sur le container directement (pas une étape), on insère en fin
    let targetIndex: number;
    if (overId === toContainer) {
      // overId est l'id du container → on dépose à la fin
      targetIndex = targetList.length;
    } else {
      const idx = targetList.findIndex((e) => e.id === overId);
      targetIndex = idx === -1 ? targetList.length : idx;
    }

    // Optimistic update
    setLocalEtapes((state) => {
      const next = state.map((e) => ({ ...e }));
      const idx = next.findIndex((e) => e.id === activeId);
      if (idx === -1) return state;
      const [moved] = next.splice(idx, 1);
      moved.rubrique_id = toContainer === NO_RUB ? null : toContainer;
      // Reconstitue l'ordre global : on parcourt rubriques puis "no rub"
      // pour simplifier on resort en utilisant les containers
      const byContainer = new Map<string, EtapeRow[]>();
      byContainer.set(NO_RUB, []);
      for (const r of localRubriques) byContainer.set(r.id, []);
      for (const e of next) {
        const cid = e.rubrique_id ?? NO_RUB;
        byContainer.get(cid)?.push(e);
      }
      const targetArr = byContainer.get(toContainer) ?? [];
      targetArr.splice(targetIndex, 0, moved);
      // Réécrit ordre
      let counter = 1;
      const result: EtapeRow[] = [];
      // d'abord no-rub
      for (const e of byContainer.get(NO_RUB) ?? []) {
        result.push({ ...e, ordre: counter++ });
      }
      for (const r of localRubriques) {
        for (const e of byContainer.get(r.id) ?? []) {
          result.push({ ...e, ordre: counter++ });
        }
      }
      return result;
    });

    startTransition(async () => {
      const targetRubId = toContainer === NO_RUB ? null : toContainer;
      // Si c'est un reorder pur dans le même container, optimisation : pas
      // besoin de toucher rubrique_id. Mais l'action moveEtape gère ça.
      await moveEtape(parcoursId, activeId, targetRubId, targetIndex);
      refresh();
    });
  }

  // -------- Handlers étapes --------
  function onUpdateEtape(etapeId: string, patch: Partial<EtapeRow>) {
    setLocalEtapes((state) =>
      state.map((e) => (e.id === etapeId ? { ...e, ...patch } : e))
    );
    startTransition(async () => {
      await updateEtape(etapeId, {
        libelle: patch.libelle,
        nom_court: patch.nom_court,
        description: patch.description,
      });
      refresh();
    });
  }

  async function onDeleteEtape(etapeId: string, libelle: string) {
    const ok = await confirm({
      title: `Supprimer l'étape « ${libelle} » ?`,
      description: "Les onboardings existants conservent la tâche. Seule la création des nouveaux dossiers est affectée.",
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    setLocalEtapes((state) => state.filter((e) => e.id !== etapeId));
    startTransition(async () => {
      await deleteEtape(etapeId);
      refresh();
    });
  }

  function onUpdateConditions(etapeId: string, conditions: ConditionsNa) {
    setLocalEtapes((state) =>
      state.map((e) =>
        e.id === etapeId ? { ...e, conditions_na: conditions } : e
      )
    );
    startTransition(async () => {
      await updateEtapeConditions(etapeId, conditions);
      refresh();
    });
  }

  // -------- Handlers rubriques --------
  function onAddRubrique() {
    startTransition(async () => {
      await createRubrique(parcoursId, { nom: "Nouvelle rubrique" });
      refresh();
    });
  }

  function onUpdateRubrique(rubId: string, patch: Partial<RubriqueRow>) {
    setLocalRubriques((state) =>
      state.map((r) => (r.id === rubId ? { ...r, ...patch } : r))
    );
    startTransition(async () => {
      await updateRubrique(rubId, {
        nom: patch.nom,
        numbering_style: patch.numbering_style,
        numbering_reset: patch.numbering_reset,
      });
      refresh();
    });
  }

  async function onDeleteRubrique(rubId: string, nom: string) {
    const ok = await confirm({
      title: `Supprimer la rubrique « ${nom} » ?`,
      description: "Les étapes qu'elle contient seront déplacées en « Sans rubrique » (non supprimées).",
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    setLocalRubriques((state) => state.filter((r) => r.id !== rubId));
    setLocalEtapes((state) =>
      state.map((e) => (e.rubrique_id === rubId ? { ...e, rubrique_id: null } : e))
    );
    startTransition(async () => {
      await deleteRubrique(rubId);
      refresh();
    });
  }

  function moveRubrique(rubId: string, direction: -1 | 1) {
    const idx = localRubriques.findIndex((r) => r.id === rubId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= localRubriques.length) return;
    const next = arrayMove(localRubriques, idx, newIdx);
    setLocalRubriques(next);
    startTransition(async () => {
      await reorderRubriques(parcoursId, next.map((r) => r.id));
      refresh();
    });
  }

  // -------- Rendu --------
  const noRubEtapes = etapesByContainer.get(NO_RUB) ?? [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {ConfirmDialog}
      <div className="space-y-3">
        {/* Section "Sans rubrique" si elle a des étapes OU s'il n'y a aucune rubrique */}
        {(noRubEtapes.length > 0 || localRubriques.length === 0) && (
          <ContainerSection
            containerId={NO_RUB}
            title={localRubriques.length === 0 ? "Étapes du parcours" : "Sans rubrique"}
            etapes={noRubEtapes}
            numbering={numbering}
            expandedEtapeId={expandedEtapeId}
            onToggleExpand={(id) =>
              setExpandedEtapeId((cur) => (cur === id ? null : id))
            }
            onUpdateEtape={onUpdateEtape}
            onDeleteEtape={onDeleteEtape}
            onUpdateConditions={onUpdateConditions}
          />
        )}

        {/* Rubriques */}
        {localRubriques.map((rub, rubIdx) => {
          const rubEtapes = etapesByContainer.get(rub.id) ?? [];
          return (
            <RubriqueSection
              key={rub.id}
              rubrique={rub}
              idx={rubIdx}
              total={localRubriques.length}
              etapes={rubEtapes}
              numbering={numbering}
              expandedEtapeId={expandedEtapeId}
              onToggleExpand={(id) =>
                setExpandedEtapeId((cur) => (cur === id ? null : id))
              }
              onUpdateRubrique={(p) => onUpdateRubrique(rub.id, p)}
              onDeleteRubrique={() => onDeleteRubrique(rub.id, rub.nom)}
              onMoveRubrique={(dir) => moveRubrique(rub.id, dir)}
              onUpdateEtape={onUpdateEtape}
              onDeleteEtape={onDeleteEtape}
              onUpdateConditions={onUpdateConditions}
            />
          );
        })}

        {/* Boutons ajout */}
        <div className="flex items-center gap-2 flex-wrap">
          <AddEtapeForm parcoursId={parcoursId} onAdded={refresh} />
          <button
            type="button"
            onClick={onAddRubrique}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Ajouter une rubrique
          </button>
        </div>
      </div>

      {/* Drag overlay : aperçu de l'étape pendant le drag */}
      <DragOverlay>
        {activeEtape ? (
          <div className="rounded-lg border bg-white shadow-lg px-4 py-2 text-sm font-medium opacity-90">
            {activeEtape.libelle}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ============================================================================
//  ContainerSection : un container droppable (sans rubrique ou rubrique)
// ============================================================================

function ContainerSection({
  containerId,
  title,
  etapes,
  numbering,
  expandedEtapeId,
  onToggleExpand,
  onUpdateEtape,
  onDeleteEtape,
  onUpdateConditions,
}: {
  containerId: ContainerId;
  title: string;
  etapes: EtapeRow[];
  numbering: Map<string, string>;
  expandedEtapeId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdateEtape: (id: string, patch: Partial<EtapeRow>) => void;
  onDeleteEtape: (id: string, libelle: string) => void;
  onUpdateConditions: (id: string, c: ConditionsNa) => void;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2 bg-zinc-50/50 border-b border-zinc-200 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <SortableEtapeList
        containerId={containerId}
        etapes={etapes}
        numbering={numbering}
        expandedEtapeId={expandedEtapeId}
        onToggleExpand={onToggleExpand}
        onUpdateEtape={onUpdateEtape}
        onDeleteEtape={onDeleteEtape}
        onUpdateConditions={onUpdateConditions}
      />
    </div>
  );
}

// ============================================================================
//  RubriqueSection : header éditable + numérotation + étapes
// ============================================================================

function RubriqueSection({
  rubrique,
  idx,
  total,
  etapes,
  numbering,
  expandedEtapeId,
  onToggleExpand,
  onUpdateRubrique,
  onDeleteRubrique,
  onMoveRubrique,
  onUpdateEtape,
  onDeleteEtape,
  onUpdateConditions,
}: {
  rubrique: RubriqueRow;
  idx: number;
  total: number;
  etapes: EtapeRow[];
  numbering: Map<string, string>;
  expandedEtapeId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdateRubrique: (patch: Partial<RubriqueRow>) => void;
  onDeleteRubrique: () => void;
  onMoveRubrique: (dir: -1 | 1) => void;
  onUpdateEtape: (id: string, patch: Partial<EtapeRow>) => void;
  onDeleteEtape: (id: string, libelle: string) => void;
  onUpdateConditions: (id: string, c: ConditionsNa) => void;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header rubrique */}
      <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2 flex-wrap">
        {/* Flèches reorder rubrique */}
        <div className="flex flex-col -space-y-1 shrink-0">
          <button
            type="button"
            onClick={() => onMoveRubrique(-1)}
            disabled={idx === 0}
            className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Monter la rubrique"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onMoveRubrique(1)}
            disabled={idx >= total - 1}
            className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Descendre la rubrique"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium shrink-0">
          Rubrique
        </div>

        <InlineText
          value={rubrique.nom}
          onCommit={(v) => onUpdateRubrique({ nom: v })}
          className="font-semibold text-sm flex-1 min-w-[200px]"
          placeholder="Nom de la rubrique"
        />

        <div className="flex items-center gap-2 text-[11px] shrink-0">
          <label className="flex items-center gap-1 text-zinc-600">
            Numéros :
            <select
              value={rubrique.numbering_style}
              onChange={(e) =>
                onUpdateRubrique({ numbering_style: e.target.value as NumberingStyle })
              }
              className="px-1.5 py-1 rounded border border-zinc-300 bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="decimal">1, 2, 3…</option>
              <option value="alpha">A, B, C…</option>
              <option value="roman">I, II, III…</option>
              <option value="none">Aucun</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-zinc-600 cursor-pointer">
            <input
              type="checkbox"
              checked={rubrique.numbering_reset}
              onChange={(e) =>
                onUpdateRubrique({ numbering_reset: e.target.checked })
              }
              className="rounded"
            />
            Recommencer à 1
          </label>
        </div>

        <button
          type="button"
          onClick={onDeleteRubrique}
          className="p-1.5 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
          title="Supprimer la rubrique"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <SortableEtapeList
        containerId={rubrique.id}
        etapes={etapes}
        numbering={numbering}
        expandedEtapeId={expandedEtapeId}
        onToggleExpand={onToggleExpand}
        onUpdateEtape={onUpdateEtape}
        onDeleteEtape={onDeleteEtape}
        onUpdateConditions={onUpdateConditions}
      />
    </div>
  );
}

// ============================================================================
//  SortableEtapeList : SortableContext + liste d'étapes draggables
// ============================================================================

function SortableEtapeList({
  containerId,
  etapes,
  numbering,
  expandedEtapeId,
  onToggleExpand,
  onUpdateEtape,
  onDeleteEtape,
  onUpdateConditions,
}: {
  containerId: ContainerId;
  etapes: EtapeRow[];
  numbering: Map<string, string>;
  expandedEtapeId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdateEtape: (id: string, patch: Partial<EtapeRow>) => void;
  onDeleteEtape: (id: string, libelle: string) => void;
  onUpdateConditions: (id: string, c: ConditionsNa) => void;
}) {
  const ids = useMemo(() => etapes.map((e) => e.id), [etapes]);
  // useDroppable : rend le wrapper du container "droppable" pour qu'on puisse
  // lâcher une étape sur une rubrique VIDE (sinon dnd-kit n'a pas de target).
  const { setNodeRef, isOver } = useDroppable({ id: containerId });
  return (
    <SortableContext
      id={containerId}
      items={ids}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "divide-y divide-zinc-100 transition-colors min-h-[40px]",
          isOver && etapes.length === 0 && "bg-amber-50/40"
        )}
      >
        {etapes.length === 0 ? (
          <div
            className={cn(
              "px-4 py-4 text-xs italic transition-colors",
              isOver ? "text-amber-700" : "text-zinc-400"
            )}
          >
            {isOver
              ? "Relâcher pour déposer ici"
              : "Déposer une étape ici (drag-and-drop)"}
          </div>
        ) : (
          etapes.map((etape) => (
            <SortableEtapeCard
              key={etape.id}
              etape={etape}
              number={numbering.get(etape.id) ?? ""}
              isExpanded={expandedEtapeId === etape.id}
              onToggleExpand={() => onToggleExpand(etape.id)}
              onUpdate={(patch) => onUpdateEtape(etape.id, patch)}
              onDelete={() => onDeleteEtape(etape.id, etape.libelle)}
              onUpdateConditions={(c) => onUpdateConditions(etape.id, c)}
            />
          ))
        )}
      </div>
    </SortableContext>
  );
}

// ============================================================================
//  SortableEtapeCard : ligne d'étape draggable (handle à gauche)
// ============================================================================

function SortableEtapeCard({
  etape,
  number,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onUpdateConditions,
}: {
  etape: EtapeRow;
  number: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<EtapeRow>) => void;
  onDelete: () => void;
  onUpdateConditions: (c: ConditionsNa) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: etape.id });
  const conditions = normalize(etape.conditions_na);
  const conditionsCount = conditions.items.length;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="px-4 py-3 bg-white">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-colors shrink-0"
          title="Glisser pour réordonner"
          aria-label="Glisser pour réordonner"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Numéro */}
        <span className="inline-flex items-center justify-center min-w-[32px] h-[26px] px-1.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold tabular-nums shrink-0">
          {number || "-"}
        </span>

        {/* Étape (nom court) */}
        <div className="shrink-0">
          <span className="block text-[9px] uppercase tracking-wide text-zinc-400 font-medium leading-none mb-0.5">
            Étape
          </span>
          <InlineText
            value={etape.nom_court}
            onCommit={(v) => onUpdate({ nom_court: v })}
            className="text-sm w-[180px]"
            placeholder="ex: Tally"
          />
        </div>

        {/* Libellé complet */}
        <div className="flex-1 min-w-[260px]">
          <span className="block text-[9px] uppercase tracking-wide text-zinc-400 font-medium leading-none mb-0.5">
            Libellé complet
          </span>
          <InlineText
            value={etape.libelle}
            onCommit={(v) => onUpdate({ libelle: v })}
            className="font-medium text-sm w-full"
            placeholder="ex: Tally rempli"
          />
        </div>

        {/* Toggle conditions + delete */}
        <div className="flex items-center gap-1 shrink-0 pt-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className={cn(
              "px-2 py-1 rounded text-[11px] font-medium border transition-colors",
              conditionsCount > 0
                ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50"
            )}
          >
            {conditionsCount > 0
              ? `${conditionsCount} condition${conditionsCount > 1 ? "s" : ""} N/A`
              : "Conditions N/A"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Supprimer l'étape"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 ml-12 border-l-2 border-amber-200 pl-3">
          <ConditionsEditor conditions={conditions} onChange={onUpdateConditions} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  Numérotation : calcule le numéro affiché pour chaque étape
// ============================================================================

function computeNumbering(
  rubriques: RubriqueRow[],
  etapes: EtapeRow[]
): Map<string, string> {
  const result = new Map<string, string>();

  // Étapes "sans rubrique" : numérotées en décimal continu en tête
  const noRub = etapes.filter((e) => !e.rubrique_id).sort((a, b) => a.ordre - b.ordre);
  let globalCounter = 0;
  for (const e of noRub) {
    globalCounter++;
    result.set(e.id, String(globalCounter));
  }

  // Rubriques dans l'ordre
  const sortedRubs = [...rubriques].sort((a, b) => a.ordre - b.ordre);
  for (const rub of sortedRubs) {
    const localStart = rub.numbering_reset ? 0 : globalCounter;
    let counter = localStart;
    const rubEtapes = etapes
      .filter((e) => e.rubrique_id === rub.id)
      .sort((a, b) => a.ordre - b.ordre);
    for (const e of rubEtapes) {
      counter++;
      result.set(e.id, formatNumber(counter, rub.numbering_style));
    }
    // Le compteur global suit si la rubrique ne reset pas
    if (!rub.numbering_reset) {
      globalCounter = counter;
    }
  }

  return result;
}

// ============================================================================
//  InlineText : input qui save au blur (bordures visibles maintenant)
// ============================================================================

function InlineText({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  if (draft !== value && draft === "") setDraft(value);
  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else setDraft(value);
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "px-2 py-1 rounded border border-zinc-300 bg-white hover:border-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 text-sm focus:outline-none transition-colors",
        className
      )}
    />
  );
}

// ============================================================================
//  ConditionsEditor : nouveau modèle
//
//  Une étape a un objet { combinator: AND|OR, items: ConditionItem[] }.
//  Chaque item = un champ × un opérateur × plusieurs valeurs (multi-select).
//
//  Sémantique :
//    - Au sein d'un item : op=eq matche si valeur du dossier ∈ values,
//                          op=neq matche si valeur du dossier ∉ values
//    - Entre items : AND (tout doit matcher) ou OR (au moins un)
// ============================================================================

const FIELDS: ConditionField[] = ["origine", "gestion_tns", "forme", "activite"];
const OPS: ConditionOp[] = ["eq", "neq"];

// Valeurs proposées en multi-select pour les champs catégoriels
const FIELD_VALUES: Partial<Record<ConditionField, Array<{ value: string; label: string }>>> = {
  origine: [
    { value: "1 - Création", label: "1 - Création" },
    { value: "2 - Reprise", label: "2 - Reprise (avec EC)" },
    { value: "3 - Reprise sans EC", label: "3 - Reprise sans EC" },
    { value: "4 - Interne", label: "4 - Interne" },
    { value: "5 - Sous-traitance", label: "5 - Sous-traitance" },
  ],
  forme: [
    "ASSO", "SA", "SCI", "EI", "SARL", "SAS", "SELARL", "SELAS",
    "SCM", "SC", "EURL", "SASU", "INDIV", "AARPI", "LMNP",
  ].map((v) => ({ value: v, label: v })),
};

function ConditionsEditor({
  conditions,
  onChange,
}: {
  conditions: ConditionsNa;
  onChange: (c: ConditionsNa) => void;
}) {
  const items = conditions.items;

  function updateItem(idx: number, patch: Partial<ConditionItem>) {
    onChange({
      ...conditions,
      items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });
  }
  function removeItem(idx: number) {
    onChange({
      ...conditions,
      items: items.filter((_, i) => i !== idx),
    });
  }
  function addItem() {
    onChange({
      ...conditions,
      items: [
        ...items,
        { field: "origine", op: "eq", values: [] },
      ],
    });
  }
  function setCombinator(c: Combinator) {
    onChange({ ...conditions, combinator: c });
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">
          Tâche N/A si
        </span>
        {items.length > 1 && (
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded bg-zinc-100 border border-zinc-200">
            <button
              type="button"
              onClick={() => setCombinator("AND")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                conditions.combinator === "AND"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              )}
              title="Toutes les conditions doivent être vraies"
            >
              ET (toutes)
            </button>
            <button
              type="button"
              onClick={() => setCombinator("OR")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                conditions.combinator === "OR"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              )}
              title="Au moins une condition doit être vraie"
            >
              OU (au moins une)
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="text-xs text-zinc-400 italic">
          Aucune condition. La tâche sera créée en « À faire » pour tous les dossiers.
        </div>
      )}

      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i}>
            <ConditionRow
              item={it}
              onUpdate={(p) => updateItem(i, p)}
              onRemove={() => removeItem(i)}
            />
            {i < items.length - 1 && (
              <div className="text-center text-[10px] font-bold text-zinc-400 my-0.5 select-none">
                {COMBINATOR_LABEL[conditions.combinator]}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Ajouter une condition
      </button>
    </div>
  );
}

function ConditionRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: ConditionItem;
  onUpdate: (patch: Partial<ConditionItem>) => void;
  onRemove: () => void;
}) {
  const isBoolField = item.field === "gestion_tns";
  const hint = FIELD_VALUES[item.field];

  function toggleValue(v: string | boolean) {
    const present = item.values.some((x) => x === v);
    const next = present ? item.values.filter((x) => x !== v) : [...item.values, v];
    onUpdate({ values: next });
  }

  return (
    <div className="flex items-start gap-1.5 flex-wrap bg-white border border-zinc-200 rounded p-2 text-xs">
      {/* Champ */}
      <select
        value={item.field}
        onChange={(e) => {
          const newField = e.target.value as ConditionField;
          // Reset values quand on change de champ (les anciennes valeurs ne correspondent plus)
          onUpdate({ field: newField, values: [] });
        }}
        className="px-1.5 py-0.5 rounded border border-zinc-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 shrink-0"
      >
        {FIELDS.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </select>

      {/* Opérateur */}
      <select
        value={item.op}
        onChange={(e) => onUpdate({ op: e.target.value as ConditionOp })}
        className="px-1.5 py-0.5 rounded border border-zinc-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 shrink-0"
      >
        {OPS.map((o) => (
          <option key={o} value={o}>
            {OP_LABEL[o]}
          </option>
        ))}
      </select>

      {/* Valeurs (multi-select via checkboxes pour booléen, sinon pills toggle) */}
      <div className="flex items-center gap-1 flex-wrap flex-1 min-w-[200px]">
        {isBoolField ? (
          // gestion_tns : 2 options (TNS / Non TNS) → cases toggle
          <>
            <ToggleValue
              label="TNS (true)"
              active={item.values.some((x) => x === true)}
              onClick={() => toggleValue(true)}
            />
            <ToggleValue
              label="Non TNS (false)"
              active={item.values.some((x) => x === false)}
              onClick={() => toggleValue(false)}
            />
          </>
        ) : hint ? (
          hint.map((opt) => (
            <ToggleValue
              key={opt.value}
              label={opt.label}
              active={item.values.some((x) => x === opt.value)}
              onClick={() => toggleValue(opt.value)}
            />
          ))
        ) : (
          // activite : text libre — on garde une simple liste séparée par virgules
          <input
            type="text"
            value={item.values.filter((x): x is string => typeof x === "string").join(", ")}
            onChange={(e) =>
              onUpdate({
                values: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="valeur1, valeur2, …"
            className="px-1.5 py-0.5 rounded border border-zinc-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 flex-1 min-w-[180px]"
          />
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-auto shrink-0"
        title="Supprimer la condition"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Pill toggle pour une valeur dans le multi-select. */
function ToggleValue({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded-full text-[11px] border transition-all active:scale-95",
        active
          ? "bg-zinc-900 text-white border-zinc-900"
          : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
    </button>
  );
}

// ============================================================================
//  AddEtapeForm : ajouter une étape (en bas)
// ============================================================================

function AddEtapeForm({
  parcoursId,
  onAdded,
}: {
  parcoursId: string;
  onAdded: () => void;
}) {
  const [nomCourt, setNomCourt] = useState("");
  const [libelle, setLibelle] = useState("");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const lib = libelle.trim();
    if (!lib) {
      setError("Libellé requis");
      return;
    }
    const nc = nomCourt.trim();
    startTransition(async () => {
      try {
        await createEtape(parcoursId, {
          libelle: lib,
          // Si nom court vide → l'action serveur auto-génère depuis le libellé
          nom_court: nc || undefined,
        });
        setNomCourt("");
        setLibelle("");
        onAdded();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border bg-card p-2 flex items-center gap-2 flex-wrap flex-1 min-w-[320px]"
    >
      {/* Nom court (étape) */}
      <div className="shrink-0">
        <span className="block text-[9px] uppercase tracking-wide text-zinc-400 font-medium leading-none mb-0.5">
          Étape
        </span>
        <input
          type="text"
          value={nomCourt}
          onChange={(e) => setNomCourt(e.target.value)}
          placeholder="ex: Tally"
          className="w-[180px] px-2 py-1 rounded border border-zinc-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      {/* Libellé complet */}
      <div className="flex-1 min-w-[200px]">
        <span className="block text-[9px] uppercase tracking-wide text-zinc-400 font-medium leading-none mb-0.5">
          Libellé complet
        </span>
        <input
          type="text"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="ex: Tally rempli"
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shrink-0 self-end mb-[1px]"
      >
        <Plus className="h-3 w-3" />
        Ajouter
      </button>
      {error && (
        <span className="w-full text-[11px] text-rose-600">{error}</span>
      )}
    </form>
  );
}
