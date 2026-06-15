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
];
// "Perdu dans l'espace" n'est plus une colonne classique : elle a sa
// propre zone "starfield" en bas du kanban (cf. SpaceDropZone). C'est
// une zone large, sombre, evocatrice, ou on lache les dossiers qui
// "tombent dans l'espace". Cote metier ils restent listes (consultables
// via la table clients) mais visuellement le pipeline ne les met plus
// au meme niveau que les vrais statuts terminaux.
const TERMINAL_STAGES: PipelineStatut[] = [
  "Z - Interne",
  "Z - Sous-traitance",
  "Z - Prospect perdu",
  "Z - Résiliée",
];
const SPACE_STATUT: PipelineStatut = "Z - Perdu dans l'espace";

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
        {/* Etapes pre-signature (1 -> 6) en une rangee compacte. On sort
            LDM signee de ce grid pour pouvoir la placer cote-a-cote avec
            la zone Perdu dans l'espace en-dessous. */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {ACTIVE_STAGES.slice(0, 6).map((s) => (
            <Column
              key={s}
              statut={s}
              cards={cardsByStage.get(s) ?? []}
              activeId={activeId}
            />
          ))}
        </div>

        {/* Rangee LDM signee + zone Perdu dans l'espace.
            LDM signee est elargie a 2 sous-colonnes internes (CSS columns)
            pour gagner en densite sur sa ~48aine de dossiers. Le flow
            est top-to-bottom dans chaque sous-colonne (col 1 = cards 1->24,
            col 2 = cards 25->48), comme une liste qui wrap. La zone
            "Perdu dans l'espace" garde flex-1 et items-stretch -> meme
            hauteur. */}
        <div className="flex gap-3 items-stretch">
          <div className="w-[620px] shrink-0">
            <Column
              statut="7 - LDM signée"
              cards={cardsByStage.get("7 - LDM signée") ?? []}
              activeId={activeId}
              columnCount={2}
            />
          </div>
          <div className="flex-1 min-w-0">
            <SpaceDropZone
              cards={cardsByStage.get(SPACE_STATUT) ?? []}
              activeId={activeId}
            />
          </div>
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

      {/* Section speciale "Perdu dans l'espace" : meme look espace que
          desktop, mais en mode liste verticale collapsable. */}
      <section className="mt-4 relative rounded-xl border border-indigo-500/20 bg-gradient-to-br from-[#0a0f1f] via-[#0d1430] to-[#0b1024] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `
              radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.5), transparent),
              radial-gradient(1px 1px at 80px 70px, rgba(199,210,254,0.4), transparent),
              radial-gradient(1.5px 1.5px at 160px 40px, rgba(255,255,255,0.5), transparent),
              radial-gradient(1px 1px at 240px 100px, rgba(199,210,254,0.4), transparent),
              radial-gradient(1px 1px at 320px 50px, rgba(255,255,255,0.5), transparent)
            `,
            backgroundSize: "400px 140px",
            backgroundRepeat: "repeat",
          }}
        />
        {(() => {
          const subset = cards.filter((c) => c.pipeline_statut === SPACE_STATUT).sort(sortColumnDesc);
          const totalArr = subset.reduce((s, c) => s + (c.arr ?? 0), 0);
          return (
            <div className="relative p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-indigo-300/80">
                  Perdu dans l&apos;espace
                </span>
                <span className="text-[10px] tabular-nums text-indigo-200/60 font-medium whitespace-nowrap">
                  {subset.length} · {fmtEuro(totalArr)}
                </span>
              </div>
              {subset.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-indigo-200/40 italic">
                  Aucun dossier en dérive.
                </div>
              ) : (
                <div className="space-y-1">
                  {subset.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-md border border-indigo-300/15 bg-indigo-950/30 px-2 py-2"
                    >
                      <Link
                        href={`/clients/${c.slug}`}
                        className="font-medium text-[12px] truncate min-w-0 flex-1 text-indigo-100/90"
                      >
                        {c.denomination}
                      </Link>
                      <span className="text-[10px] tabular-nums text-indigo-200/50 font-medium shrink-0">
                        {fmtEuro(c.arr ?? 0)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPickerOpenFor(c.id)}
                        className="shrink-0 ml-1 inline-flex items-center justify-center w-7 h-7 rounded-md border border-indigo-300/15 bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-200/60 transition-colors"
                        aria-label="Changer le statut"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </section>

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
          {/* Perdu dans l'espace : option speciale, separee visuellement
              avec un fond degrade comme la drop zone. */}
          <div className="text-[10px] uppercase tracking-wide text-indigo-400 px-2 pt-3">
            Zone de dérive
          </div>
          {(() => {
            const active = card.pipeline_statut === SPACE_STATUT;
            return (
              <button
                type="button"
                onClick={() => onPick(SPACE_STATUT)}
                className={cn(
                  "w-full text-left px-3 py-3 rounded-md flex items-center gap-2 transition-colors",
                  "bg-gradient-to-r from-[#0d1430] to-[#1a1f3d] text-indigo-100",
                  active && "ring-2 ring-indigo-400/60"
                )}
              >
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border border-indigo-300/30 text-indigo-100">
                  {SHORT_LABEL[SPACE_STATUT]}
                </span>
                {active && <span className="ml-auto text-indigo-200">✓</span>}
              </button>
            );
          })()}
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

// ============================================================================
//  Zone "Perdu dans l'espace" : drop zone speciale, look espace profond.
//
//  Sortie du flot des colonnes terminales pour bien materialiser que ces
//  dossiers ne sont pas dans un funnel commercial actif : on les a laisses
//  tomber dans le vide. Le drop fonctionne avec dnd-kit comme les colonnes
//  classiques (id = "Z - Perdu dans l'espace"), mais visuellement c'est un
//  panel large et sombre avec un starfield CSS.
// ============================================================================
const SpaceDropZone = memo(function SpaceDropZone({
  cards,
  activeId,
}: {
  cards: PipelineCard[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: SPACE_STATUT });
  const totalArr = cards.reduce((s, c) => s + (c.arr ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // h-full pour suivre la hauteur de la colonne LDM signee voisine.
        "relative h-full rounded-2xl border overflow-hidden transition-all",
        "border-indigo-500/20",
        // Background "espace profond" : gradient dark navy + starfield.
        "bg-gradient-to-br from-[#0a0f1f] via-[#0d1430] to-[#0b1024]",
        isOver
          ? "ring-2 ring-indigo-400/60 ring-offset-2 ring-offset-background border-indigo-400/50 shadow-[0_0_60px_-10px_rgba(99,102,241,0.5)]"
          : "shadow-[0_0_40px_-15px_rgba(99,102,241,0.25)] hover:shadow-[0_0_50px_-15px_rgba(99,102,241,0.35)]"
      )}
    >
      {/* Starfield decoratif : couches de points blancs via box-shadow.
          Pure CSS, zero JS. Pointer-events-none pour ne pas gener le drop. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.6), transparent),
            radial-gradient(1px 1px at 60px 70px, rgba(255,255,255,0.4), transparent),
            radial-gradient(1.5px 1.5px at 120px 40px, rgba(199,210,254,0.5), transparent),
            radial-gradient(1px 1px at 200px 90px, rgba(255,255,255,0.5), transparent),
            radial-gradient(1px 1px at 280px 20px, rgba(255,255,255,0.3), transparent),
            radial-gradient(1.5px 1.5px at 340px 110px, rgba(199,210,254,0.4), transparent),
            radial-gradient(1px 1px at 420px 60px, rgba(255,255,255,0.5), transparent),
            radial-gradient(1px 1px at 500px 130px, rgba(255,255,255,0.4), transparent),
            radial-gradient(1.5px 1.5px at 580px 50px, rgba(199,210,254,0.5), transparent),
            radial-gradient(1px 1px at 660px 100px, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 740px 30px, rgba(255,255,255,0.6), transparent),
            radial-gradient(1.5px 1.5px at 820px 80px, rgba(199,210,254,0.4), transparent)
          `,
          backgroundSize: "900px 160px",
          backgroundRepeat: "repeat",
        }}
      />
      {/* Halo central indigo qui pulse legerement au hover-drop */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity",
          isOver ? "opacity-100" : "opacity-40"
        )}
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(99,102,241,0.15), transparent 70%)",
        }}
      />

      <div className="relative h-full flex flex-col p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-indigo-300/80">
              Perdu dans l&apos;espace
            </span>
            <span className="text-[10px] text-indigo-200/40 italic hidden sm:inline">
              · zone de derive
            </span>
          </div>
          <div className="text-[11px] tabular-nums whitespace-nowrap text-indigo-200/60 font-medium">
            {cards.length} {cards.length > 1 ? "dossiers" : "dossier"} · {fmtEuro(totalArr)}
          </div>
        </div>

        {cards.length === 0 ? (
          // Vide : message centre verticalement dans tout l'espace dispo.
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[13px] text-indigo-200/40 italic leading-relaxed max-w-md">
              Glisse un dossier ici pour le mettre en sommeil.
              <br />
              Il flottera en attendant un signe de vie.
            </div>
          </div>
        ) : (
          // Avec contenu : grille auto-fit qui remplit l'espace, scrollable
          // si on depasse la hauteur de la rangee (= LDM signee voisine).
          <div className="flex-1 overflow-y-auto pr-1 -mr-1">
            <div className="grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
              {cards.map((c) => (
                <SpaceCard key={c.id} card={c} muted={activeId === c.id} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Re-render uniquement si la liste change ou si activeId concerne une
  // carte de la zone (pour appliquer `muted`).
  if (prev.cards.length !== next.cards.length) return false;
  for (let i = 0; i < prev.cards.length; i++) {
    if (prev.cards[i].id !== next.cards[i].id) return false;
    if (prev.cards[i].arr !== next.cards[i].arr) return false;
    if (prev.cards[i].denomination !== next.cards[i].denomination) return false;
  }
  const prevHasActive = prev.cards.some((c) => c.id === prev.activeId);
  const nextHasActive = next.cards.some((c) => c.id === next.activeId);
  if (prevHasActive !== nextHasActive || prev.activeId !== next.activeId) {
    if (prevHasActive || nextHasActive) return false;
  }
  return true;
});

/** Carte light, theme sombre, pour la zone espace. Reutilise le draggable
 *  dnd-kit pour pouvoir ressortir un dossier de la zone si l'utilisateur
 *  change d'avis. */
const SpaceCard = memo(function SpaceCard({
  card,
  muted = false,
}: {
  card: PipelineCard;
  muted?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition: "none",
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-md border border-indigo-300/15 bg-indigo-950/30 backdrop-blur-sm",
        "px-2 py-1.5 flex items-center gap-1.5 select-none",
        !isDragging && "hover:border-indigo-300/30 hover:bg-indigo-900/40 transition-colors",
        muted && "opacity-30"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Déplacer hors de Perdu dans l'espace"
        className="shrink-0 -my-1.5 -ml-1 px-1 py-2 text-indigo-300/30 hover:text-indigo-200/70 cursor-grab active:cursor-grabbing touch-none transition-colors"
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <Link
        href={`/clients/${card.slug}`}
        className="font-medium text-[12px] truncate min-w-0 flex-1 text-indigo-100/90 group-hover:text-indigo-50 transition-colors"
      >
        {card.denomination}
      </Link>
      <span className="text-[10px] tabular-nums text-indigo-200/50 font-medium shrink-0">
        {fmtEuro(card.arr ?? 0)}
      </span>
    </div>
  );
});

const Column = memo(function Column({
  statut,
  cards,
  activeId,
  terminal = false,
  columnCount = 1,
}: {
  statut: PipelineStatut | null;
  cards: PipelineCard[];
  activeId: string | null;
  terminal?: boolean;
  /** Nombre de sous-colonnes internes pour afficher les cards.
   *  1 = empile vertical (default). >1 = CSS multi-column qui flow
   *  top-to-bottom DANS chaque sous-col (col1 = cards 1..N/k, col2 = cards
   *  N/k+1..2N/k, etc.). Utilise uniquement pour LDM signee qui a bcp
   *  de dossiers. */
  columnCount?: number;
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
      <div className="flex-1 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <div className="text-[11px] text-zinc-400 text-center py-10 italic">
            (vide)
          </div>
        ) : columnCount > 1 ? (
          // CSS multi-column : flow top-to-bottom DANS chaque sous-colonne.
          // Col 1 contient cards 1..N/k, col 2 contient cards N/k+1..2N/k,
          // etc. Cf. lecture journal : haut->bas puis colonne suivante.
          // break-inside-avoid empeche une card d'etre coupee en deux entre
          // 2 colonnes.
          <div style={{ columns: columnCount, columnGap: "0.375rem" }}>
            {cards.map((c) => (
              <div key={c.id} className="break-inside-avoid mb-1.5">
                <Card card={c} muted={activeId === c.id} />
              </div>
            ))}
          </div>
        ) : (
          // Mode default : empilement vertical simple.
          <div className="space-y-1.5">
            {cards.map((c) => (
              <Card key={c.id} card={c} muted={activeId === c.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Re-render la colonne uniquement si :
  // - sa liste de cartes change (déplacement intra/inter-colonnes)
  // - activeId change ET concerne une carte de cette colonne (pour muted)
  // - columnCount change (changement de mode mono <-> multi-col)
  if (prev.statut !== next.statut || prev.terminal !== next.terminal) return false;
  if (prev.columnCount !== next.columnCount) return false;
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
