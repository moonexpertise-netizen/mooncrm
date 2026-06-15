"use client";

import { memo, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GripVertical, ArrowRightLeft } from "lucide-react";
import { useLdmCelebration } from "@/app/clients/[slug]/use-ldm-celebration";
import { toastError } from "@/lib/toast-helpers";
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
  /** ISO timestamp de la derniere bascule de pipeline_statut. Sert au tri
   *  du kanban (dernier arrive en haut). Backfilled par migration 0047. */
  pipeline_changed_at: string | null;
  /** Date de signature LDM (YYYY-MM-DD). Sert au tri specifique de la
   *  colonne "7 - LDM signee" : les plus recemment signes en haut. */
  mois_signature: string | null;
};

const ACTIVE_STAGES: PipelineStatut[] = [
  "1 - Tally à envoyer",
  "2 - Tally à compléter",
  "3 - PC à préparer",
  "4 - PC envoyée",
  "5 - PC acceptée",
  "6 - LDM envoyée",
  "7 - LDM signée",
  // "Perdu dans l'espace" reste dans la zone active du kanban (a cote
  // de LDM signee) plutot que dans "Hors pipeline actif" : ce sont des
  // prospects en sommeil mais susceptibles de revenir, l'oeil doit les
  // voir naturellement avec les autres prospects.
  "Z - Perdu dans l'espace",
];
const TERMINAL_STAGES: PipelineStatut[] = [
  "Z - Interne",
  "Z - Sous-traitance",
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
  "Z - Sous-traitance": "Sous-traitance",
  "Z - Perdu dans l'espace": "Perdu dans l'espace",
  "Z - Prospect perdu": "Prospect perdu",
  "Z - Résiliée": "Résiliée",
};

/** Tri DESC d'une colonne kanban.
 *
 *  - Colonne "7 - LDM signee" : par mois_signature DESC (les plus
 *    recemment signes en tete). C'est la date metier qui compte la,
 *    pas la date de bascule pipeline.
 *  - Toutes les autres colonnes : par pipeline_changed_at DESC (dernier
 *    arrive en tete). Sert au signal "qui a bouge recemment".
 *
 *  Fallback alphabetique sur denomination si les timestamps sont absents
 *  (migration 0047 pas encore appliquee, ou signature pas encore datee).
 */
function sortColumnDesc(a: PipelineCard, b: PipelineCard): number {
  // Les cards d'une meme colonne ont le meme pipeline_statut. On regarde
  // a.pipeline_statut (b.pipeline_statut est garanti egal).
  if (a.pipeline_statut === "7 - LDM signée") {
    const ma = a.mois_signature;
    const mb = b.mois_signature;
    if (ma && mb && ma !== mb) return mb.localeCompare(ma);
    if (ma && !mb) return -1;
    if (mb && !ma) return 1;
    // Tie-break : pipeline_changed_at, puis denomination
  }
  const ta = a.pipeline_changed_at;
  const tb = b.pipeline_changed_at;
  if (ta && tb && ta !== tb) return tb.localeCompare(ta);
  if (ta && !tb) return -1;
  if (tb && !ta) return 1;
  return a.denomination.localeCompare(b.denomination, "fr");
}

export default function PipelineKanban({ cards }: { cards: PipelineCard[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // État local optimiste : appliqué immédiatement, puis revalidate côté serveur
  const [localCards, setLocalCards] = useState<PipelineCard[]>(cards);

  // Index pre-trie par stage : un seul useMemo qui produit la map
  // statut -> cards triees DESC par pipeline_changed_at. Eviter de
  // re-trier dans chaque Column.
  const cardsByStage = useMemo(() => {
    const map = new Map<string, PipelineCard[]>();
    for (const c of localCards) {
      const key = c.pipeline_statut ?? "__none";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort(sortColumnDesc);
    return map;
  }, [localCards]);
  // Confettis + achievement card a chaque LDM signee, peu importe le chemin
  // (drag-drop desktop OU picker mobile). Coherent avec LDMSigneeButton
  // et PipelinePicker sur la fiche client.
  const { celebrate, achievementSlot } = useLdmCelebration();

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
    moveCardOptimistic(cardId, newStatut);
  }

  // Helper réutilisable : utilisé par le drag desktop ET le picker mobile.
  // Optimistic update local immediat, puis movePipeline cote serveur (qui
  // delegue a setPipelineStatut). Si la transition est une PREMIERE
  // signature LDM, on declenche confettis + achievement card via
  // useLdmCelebration. Coherent avec la fiche client (LDMSigneeButton /
  // PipelinePicker).
  function moveCardOptimistic(cardId: string, newStatut: PipelineStatut) {
    const prev = localCards.find((c) => c.id === cardId);
    const previousStatut = prev?.pipeline_statut;
    const previousChangedAt = prev?.pipeline_changed_at ?? null;
    const previousMoisSignature = prev?.mois_signature ?? null;
    // Optimistic : pipeline_changed_at = maintenant pour le tri DESC.
    // Si on bascule vers "7 - LDM signee" pour la 1ere fois et qu'il n'y
    // a pas de mois_signature, on en pose une (date du jour) pour que la
    // colonne soit triee correctement immediatement. Le serveur fera
    // pareil via setPipelineStatut.
    const nowIso = new Date().toISOString();
    const today = nowIso.substring(0, 10);
    const isSigningNow =
      newStatut === "7 - LDM signée" && previousStatut !== "7 - LDM signée";
    setLocalCards((s) =>
      s.map((c) =>
        c.id === cardId
          ? {
              ...c,
              pipeline_statut: newStatut,
              pipeline_changed_at: nowIso,
              mois_signature:
                isSigningNow && !c.mois_signature ? today : c.mois_signature,
            }
          : c
      )
    );
    startTransition(async () => {
      try {
        const res = await movePipeline(cardId, newStatut);
        if (res.signature) {
          celebrate(res.signature);
        }
        router.refresh();
      } catch (e) {
        // Rollback optimistic + toast
        setLocalCards((s) =>
          s.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  pipeline_statut: previousStatut ?? c.pipeline_statut,
                  pipeline_changed_at: previousChangedAt,
                  mois_signature: previousMoisSignature,
                }
              : c
          )
        );
        toastError(e, "Echec du changement de statut");
      }
    });
  }

  const activeCard = activeId ? localCards.find((c) => c.id === activeId) : null;

  return (
    <>
      {achievementSlot}
      {/* Vue MOBILE : liste empilée verticale par stage, picker statut sur
          chaque carte (le drag-drop tactile est trop fragile). */}
      <div className="md:hidden">
        <MobilePipelineList
          cards={localCards}
          onMove={moveCardOptimistic}
        />
      </div>

      {/* Vue DESKTOP : kanban drag-drop classique */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
      <div className="hidden md:block space-y-4">
        {/* Étapes actives - grid auto-fit qui wrap si nécessaire. */}
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
              cards={cardsByStage.get(s) ?? []}
              activeId={activeId}
            />
          ))}
        </div>

        {/* Terminaux - visuellement séparés en bas */}
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
                cards={cardsByStage.get(s) ?? []}
                activeId={activeId}
                terminal
              />
            ))}
            <Column
              key="__none"
              statut={null}
              cards={cardsByStage.get("__none") ?? []}
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
          <div className="rounded border bg-white dark:bg-[hsl(var(--surface-elevated))] px-2 py-1 shadow-xl ring-2 ring-[hsl(var(--gold))]/40 flex items-center gap-2 cursor-grabbing">
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
    </>
  );
}

// ============================================================================
//  Vue mobile : liste empilée par stage + picker statut sur chaque card
// ============================================================================

function MobilePipelineList({
  cards,
  onMove,
}: {
  cards: PipelineCard[];
  onMove: (cardId: string, newStatut: PipelineStatut) => void;
}) {
  // Stages dépliés : par défaut tous ouverts en mobile (l'utilisateur voit
  // immédiatement tous les dossiers). L'utilisateur peut replier.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // Carte dont le picker statut est ouvert
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  function toggle(s: string) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const totalArr = (subset: PipelineCard[]) =>
    subset.reduce((acc, c) => acc + (c.arr ?? 0), 0);

  function renderSection(statut: PipelineStatut | null, label: string) {
    const subset = cards
      .filter((c) => c.pipeline_statut === statut)
      .sort(sortColumnDesc);
    const isClosed = closed.has(String(statut ?? "__none"));
    const color = statut
      ? PIPELINE_COLORS[statut] ?? ""
      : "bg-zinc-50 text-zinc-500 border-zinc-200";
    return (
      <section key={statut ?? "__none"} className="rounded-lg border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => toggle(String(statut ?? "__none"))}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-zinc-50 transition-colors"
          aria-expanded={!isClosed}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border truncate",
                color
              )}
            >
              {label}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {subset.length} · {fmtEuro(totalArr(subset))}
            </span>
          </div>
          <span
            className={cn(
              "text-zinc-400 text-xs transition-transform",
              isClosed && "-rotate-90"
            )}
            aria-hidden
          >
            ▼
          </span>
        </button>
        {!isClosed && (
          <div className="divide-y divide-zinc-100">
            {subset.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">
                (vide)
              </div>
            ) : (
              subset.map((c) => (
                <div key={c.id} className="px-3 py-2.5 flex items-center gap-2">
                  <Link
                    href={`/clients/${c.slug}`}
                    className="font-medium text-sm truncate min-w-0 flex-1 hover:text-[hsl(var(--gold))] transition-colors"
                  >
                    {c.denomination}
                  </Link>
                  <span className="text-xs tabular-nums text-zinc-700 font-medium shrink-0">
                    {fmtEuro(c.arr ?? 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpenFor(c.id)}
                    className="shrink-0 ml-1 inline-flex items-center justify-center w-8 h-8 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-500 active:bg-zinc-100 transition-colors"
                    aria-label="Changer le statut"
                    title="Déplacer"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {ACTIVE_STAGES.map((s) => renderSection(s, SHORT_LABEL[s]))}

      <div className="pt-3 border-t border-zinc-200">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 px-1">
          Hors pipeline actif
        </div>
        <div className="space-y-3">
          {TERMINAL_STAGES.map((s) => renderSection(s, SHORT_LABEL[s]))}
          {renderSection(null, "Non paramétré")}
        </div>
      </div>

      {/* Picker statut : modal plein écran qui slide-up depuis le bas */}
      {pickerOpenFor && (
        <MobileStatutPicker
          card={cards.find((c) => c.id === pickerOpenFor) ?? null}
          onClose={() => setPickerOpenFor(null)}
          onPick={(statut) => {
            onMove(pickerOpenFor, statut);
            setPickerOpenFor(null);
          }}
        />
      )}
    </div>
  );
}

function MobileStatutPicker({
  card,
  onClose,
  onPick,
}: {
  card: PipelineCard | null;
  onClose: () => void;
  onPick: (statut: PipelineStatut) => void;
}) {
  if (!card) return null;
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 animate-fade-in"
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Choisir un statut"
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-2xl animate-slide-up-fade max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom,16px)]"
      >
        <div className="px-4 pt-3 pb-2 border-b sticky top-0 bg-white">
          <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-2" />
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Déplacer vers
          </div>
          <div className="text-sm font-medium text-zinc-900 truncate">
            {card.denomination}
          </div>
        </div>
        <div className="p-2 space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 px-2 pt-1">
            Étapes actives
          </div>
          {ACTIVE_STAGES.map((s) => {
            const active = card.pipeline_statut === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className={cn(
                  "w-full text-left px-3 py-3 rounded-md flex items-center gap-2 transition-colors",
                  active
                    ? "bg-[hsl(var(--gold))]/10"
                    : "hover:bg-zinc-50 active:bg-zinc-100"
                )}
              >
                <span
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
                    PIPELINE_COLORS[s] ?? ""
                  )}
                >
                  {SHORT_LABEL[s]}
                </span>
                {active && <span className="ml-auto text-zinc-400">✓</span>}
              </button>
            );
          })}
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 px-2 pt-3">
            Hors pipeline actif
          </div>
          {TERMINAL_STAGES.map((s) => {
            const active = card.pipeline_statut === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className={cn(
                  "w-full text-left px-3 py-3 rounded-md flex items-center gap-2 transition-colors",
                  active
                    ? "bg-[hsl(var(--gold))]/10"
                    : "hover:bg-zinc-50 active:bg-zinc-100"
                )}
              >
                <span
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
                    PIPELINE_COLORS[s] ?? ""
                  )}
                >
                  {SHORT_LABEL[s]}
                </span>
                {active && <span className="ml-auto text-zinc-400">✓</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-3 text-sm text-zinc-600 border-t hover:bg-zinc-50 active:bg-zinc-100"
        >
          Annuler
        </button>
      </div>
    </>
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
        "rounded-2xl border border-zinc-200/70 bg-zinc-50/40 flex flex-col transition-all",
        "min-w-[85vw] md:min-w-0 snap-start shrink-0 md:shrink",
        terminal ? "max-h-none md:max-h-[280px]" : "max-h-none md:max-h-[560px]",
        isOver && "ring-2 ring-[hsl(var(--gold))] ring-offset-2 bg-[hsl(var(--gold))]/[0.03] border-[hsl(var(--gold))]/30"
      )}
    >
      <div className={cn("px-3 py-2.5 border-b border-zinc-200/60 flex items-center justify-between gap-2 md:static sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm rounded-t-2xl")}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border truncate", color)}>
            {label}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 tabular-nums whitespace-nowrap font-medium">
          {cards.length} · {fmtEuro(totalArr)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {cards.length === 0 ? (
          <div className="text-[11px] text-zinc-400 text-center py-10 italic">
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
 * Carte kanban - wrappée en React.memo pour éviter le re-render des 79
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
        "group rounded-lg border border-zinc-200/70 bg-white px-2 py-1.5 select-none shadow-card",
        "flex items-center gap-2",
        !isDragging && !isOverlay && "hover:border-zinc-300 hover:shadow-card-hover hover:-translate-y-px transition-all duration-150",
        muted && "opacity-30",
        isOverlay && "shadow-modal ring-2 ring-[hsl(var(--gold))]/50 cursor-grabbing scale-[1.02]"
      )}
    >
      {/* Drag handle : la seule zone qui déclenche le drag. */}
      <button
        type="button"
        ref={undefined}
        {...(isOverlay ? {} : attributes)}
        {...(isOverlay ? {} : listeners)}
        aria-label="Déplacer la carte"
        className={cn(
          "shrink-0 -my-1.5 -ml-2 px-1.5 py-2 text-zinc-300 hover:text-zinc-600 group-hover:text-zinc-400 rounded-l-lg transition-colors",
          "cursor-grab active:cursor-grabbing touch-none"
        )}
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Link
        href={`/clients/${card.slug}`}
        className="font-medium text-xs truncate min-w-0 flex-1 text-zinc-900 group-hover:text-[hsl(var(--gold-dark))] transition-colors"
      >
        {card.denomination}
      </Link>

      <span className="text-[11px] tabular-nums text-zinc-700 font-semibold shrink-0">
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
