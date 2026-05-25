"use client";

import { memo, useState, useTransition } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import { movePipeline } from "./actions";
import type { PipelineStatut } from "@/app/clients/[slug]/actions";

export type PipelineCard = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  forme: string | null;
  activite: string | null;
  arr: number;
  pipeline_statut: PipelineStatut | null;
};

const ACTIVE_STAGES: PipelineStatut[] = [
  "1 - Tally à envoyer",
  "2 - Tally à compléter",
  "3 - PC à préparer",
  "4 - PC envoyée",
  "5 - PC acceptée",
  "6 - LDM envoyée",
  "7 - LDM signée",
];
const TERMINAL_STAGES: PipelineStatut[] = [
  "Z - Interne",
  "Z - Prospect perdu",
  "Z - Résiliée",
];

const SHORT_LABEL: Record<PipelineStatut, string> = {
  "1 - Tally à envoyer": "Tally à envoyer",
  "2 - Tally à compléter": "Tally à compléter",
  "3 - PC à préparer": "PC à préparer",
  "4 - PC envoyée": "PC envoyée",
  "5 - PC acceptée": "PC acceptée",
  "6 - LDM envoyée": "LDM envoyée",
  "7 - LDM signée": "LDM signée",
  "Z - Interne": "Interne",
  "Z - Prospect perdu": "Prospect perdu",
  "Z - Résiliée": "Résiliée",
};

export default function PipelineKanban({ cards }: { cards: PipelineCard[] }) {
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // État local optimiste : appliqué immédiatement, puis revalidate côté serveur
  const [localCards, setLocalCards] = useState<PipelineCard[]>(cards);

  // Avec un drag handle dédié (grip à gauche), on peut être plus permissif
  // sur l'activation : 4px souris (réactif), delay court touch (220ms).
  // Le link au milieu de la card a son propre clic, plus de conflit.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const newStatut = String(overId) as PipelineStatut;
    const cardId = String(e.active.id);
    const card = localCards.find((c) => c.id === cardId);
    if (!card || card.pipeline_statut === newStatut) return;

    // Optimistic update
    setLocalCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, pipeline_statut: newStatut } : c))
    );
    startTransition(async () => {
      await movePipeline(cardId, newStatut);
    });
  }

  const activeCard = activeId ? localCards.find((c) => c.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {/* Étapes actives — mobile : scroll-x snap (1 colonne plein écran).
            Desktop : grid auto-fit qui wrap si nécessaire. */}
        <div
          className="flex md:grid gap-3 pb-2 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none -mx-3 px-3 sm:-mx-0 sm:px-0"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {ACTIVE_STAGES.map((s) => (
            <Column
              key={s}
              statut={s}
              cards={localCards.filter((c) => c.pipeline_statut === s)}
              activeId={activeId}
            />
          ))}
        </div>

        {/* Terminaux — visuellement séparés en bas */}
        <div className="border-t pt-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Hors pipeline actif
          </div>
          <div
            className="grid gap-3 pb-2"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {TERMINAL_STAGES.map((s) => (
              <Column
                key={s}
                statut={s}
                cards={localCards.filter((c) => c.pipeline_statut === s)}
                activeId={activeId}
                terminal
              />
            ))}
            <Column
              key="__none"
              statut={null}
              cards={localCards.filter((c) => c.pipeline_statut === null)}
              activeId={activeId}
              terminal
            />
          </div>
        </div>
      </div>

      {/* Overlay visuel pendant le drag : version "ghost" légère de la card,
          sans Link interne (pas besoin de naviguer pendant un drag). */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="rounded border bg-white px-2 py-1 shadow-xl ring-2 ring-[hsl(var(--gold))]/40 flex items-center gap-2 cursor-grabbing">
            <span className="font-medium text-xs truncate">
              {activeCard.denomination}
            </span>
            <span className="text-[11px] tabular-nums text-zinc-700 font-medium shrink-0 ml-auto">
              {fmtEuro(activeCard.arr ?? 0)}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

const Column = memo(function Column({
  statut,
  cards,
  activeId,
  terminal = false,
}: {
  statut: PipelineStatut | null;
  cards: PipelineCard[];
  activeId: string | null;
  terminal?: boolean;
}) {
  // null = colonne "non paramétré" non droppable
  const { setNodeRef, isOver } = useDroppable({
    id: statut ?? "__none_dropzone",
    disabled: statut === null,
  });

  const label = statut ? SHORT_LABEL[statut] : "Non paramétré";
  const color = statut ? PIPELINE_COLORS[statut] ?? "" : "bg-zinc-50 text-zinc-500 border-zinc-200";
  const totalArr = cards.reduce((s, c) => s + (c.arr ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-card flex flex-col",
        // Mobile : colonne snap-start ~85vw, hauteur libre. Desktop : largeur
        // dynamique via grid + hauteur fixe pour compacité.
        "min-w-[85vw] md:min-w-0 snap-start shrink-0 md:shrink",
        terminal ? "max-h-none md:max-h-[280px]" : "max-h-none md:max-h-[500px]",
        isOver && "ring-2 ring-[hsl(var(--gold))] ring-offset-1"
      )}
    >
      <div className={cn("px-3 py-2 border-b flex items-center justify-between gap-2 md:static sticky top-0 z-10 bg-card", terminal && "bg-zinc-50/50")}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border truncate", color)}>
            {label}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
          {cards.length} · {fmtEuro(totalArr)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {cards.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-6">
            (vide)
          </div>
        ) : (
          cards.map((c) => (
            <Card key={c.id} card={c} muted={activeId === c.id} />
          ))
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Re-render la colonne uniquement si :
  // - sa liste de cartes change (déplacement intra/inter-colonnes)
  // - activeId change ET concerne une carte de cette colonne (pour muted)
  if (prev.statut !== next.statut || prev.terminal !== next.terminal) return false;
  if (prev.cards.length !== next.cards.length) return false;
  for (let i = 0; i < prev.cards.length; i++) {
    if (prev.cards[i].id !== next.cards[i].id) return false;
    if (prev.cards[i].arr !== next.cards[i].arr) return false;
    if (prev.cards[i].denomination !== next.cards[i].denomination) return false;
  }
  // Si activeId pointe vers une carte de cette colonne (avant ou après),
  // on re-render pour appliquer/retirer le `muted`.
  const prevHasActive = prev.cards.some((c) => c.id === prev.activeId);
  const nextHasActive = next.cards.some((c) => c.id === next.activeId);
  if (prevHasActive !== nextHasActive || prev.activeId !== next.activeId) {
    if (prevHasActive || nextHasActive) return false;
  }
  return true;
});

/**
 * Carte kanban — wrappée en React.memo pour éviter le re-render des 79
 * cartes à chaque mouvement (gros gain de fluidité avec dnd-kit).
 *
 * UX : drag handle dédié à GAUCHE (icône grip ⋮⋮). Le reste de la carte
 * est un <Link> normal qui se clique sans interférence avec le drag. Plus
 * de bug "le link se déclenche quand on bouge".
 */
const Card = memo(function Card({
  card,
  isOverlay = false,
  muted = false,
}: {
  card: PipelineCard;
  isOverlay?: boolean;
  muted?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    // Le drag ne se déclenche QUE depuis le handle (pas depuis la card entière)
  });
  // GPU translate pour fluidité. translate3d force la composition couche
  // séparée → pas de repaint coûteux du body pendant le drag.
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        // Pendant le drag, on évite tout effet hover/transition coûteux
        transition: "none",
      }
    : undefined;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={cn(
        "rounded border bg-white px-1.5 py-1 select-none",
        "flex items-center gap-1.5",
        // Hover seulement quand on ne drag pas (évite repaints inutiles)
        !isDragging && !isOverlay && "hover:border-zinc-400 hover:shadow-sm transition-[border-color,box-shadow] duration-150",
        muted && "opacity-30",
        isOverlay && "shadow-xl ring-2 ring-[hsl(var(--gold))]/40 cursor-grabbing"
      )}
    >
      {/* Drag handle : la seule zone qui déclenche le drag. Touch target 28px
          large × pleine hauteur → facile à attraper au pouce sur mobile. */}
      <button
        type="button"
        ref={undefined}
        {...(isOverlay ? {} : attributes)}
        {...(isOverlay ? {} : listeners)}
        aria-label="Déplacer la carte"
        className={cn(
          "shrink-0 -my-1 -ml-1.5 px-1 py-1.5 text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 rounded-l transition-colors",
          "cursor-grab active:cursor-grabbing touch-none"
        )}
        // Empêche le click sur le handle de propager (sinon ferme rapidement)
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Lien client : prend tout l'espace dispo, click normal sans drag.
          Pas besoin de stopPropagation car les listeners sont sur le handle. */}
      <Link
        href={`/clients/${card.slug}`}
        className="font-medium text-xs truncate min-w-0 flex-1 hover:text-[hsl(var(--gold))] transition-colors"
      >
        {card.denomination}
      </Link>

      <span className="text-[11px] tabular-nums text-zinc-700 font-medium shrink-0">
        {fmtEuro(card.arr ?? 0)}
      </span>
    </div>
  );
}, (prev, next) => {
  // Re-render uniquement si l'état visible change. La référence `card`
  // change à chaque setLocalCards, donc on compare les primitives.
  return (
    prev.card.id === next.card.id &&
    prev.card.slug === next.card.slug &&
    prev.card.denomination === next.card.denomination &&
    prev.card.arr === next.card.arr &&
    prev.card.pipeline_statut === next.card.pipeline_statut &&
    prev.isOverlay === next.isOverlay &&
    prev.muted === next.muted
  );
});
