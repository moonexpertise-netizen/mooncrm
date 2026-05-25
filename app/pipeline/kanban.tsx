"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import { movePipeline } from "./actions";
import type { PipelineStatut } from "@/app/clients/[id]/actions";

export type PipelineCard = {
  id: string;
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
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
        {/* Étapes actives — grid auto-fit : les colonnes s'étirent pour
            remplir la largeur dispo, wrappent sur 2 lignes si trop étroit. */}
        <div
          className="grid gap-3 pb-2"
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

      <DragOverlay>
        {activeCard ? <Card card={activeCard} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
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
        "min-w-0 rounded-lg border bg-card flex flex-col",
        // Hauteur fixe pour rester compact même quand les colonnes wrap sur
        // plusieurs lignes (les écrans étroits passent en 2 lignes au lieu
        // de scroll horizontal).
        terminal ? "max-h-[280px]" : "max-h-[500px]",
        isOver && "ring-2 ring-[hsl(var(--gold))] ring-offset-1"
      )}
    >
      <div className={cn("px-3 py-2 border-b flex items-center justify-between gap-2", terminal && "bg-zinc-50/50")}>
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
            <Card key={c.id} card={c} isOverlay={activeId === c.id} muted={activeId === c.id} />
          ))
        )}
      </div>
    </div>
  );
}

function Card({
  card,
  isOverlay = false,
  muted = false,
}: {
  card: PipelineCard;
  isOverlay?: boolean;
  muted?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: card.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={cn(
        "rounded border bg-white px-2 py-1 cursor-grab active:cursor-grabbing select-none",
        "hover:border-zinc-400 hover:shadow-sm transition",
        "flex items-center justify-between gap-2",
        muted && "opacity-30",
        isOverlay && "shadow-lg ring-1 ring-zinc-200"
      )}
    >
      <Link
        href={`/clients/${card.id}`}
        // Empêche le drag de déclencher la navigation
        onPointerDown={(e) => e.stopPropagation()}
        className="font-medium text-xs truncate min-w-0 hover:text-[hsl(var(--gold))] transition-colors"
      >
        {card.denomination}
      </Link>
      <span className="text-[11px] tabular-nums text-zinc-700 font-medium shrink-0">
        {fmtEuro(card.arr ?? 0)}
      </span>
    </div>
  );
}
