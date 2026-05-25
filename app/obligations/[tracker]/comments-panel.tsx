"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addComment,
  deleteComment,
  listComments,
  type Comment,
} from "@/app/obligations/comments-actions";

/**
 * Popover commentaires style Notion : compact, ancré près de la cellule
 * cliquée, slide-up animation. Pas de full-screen ni de slide-over.
 *
 * - Position fixed calculée à partir de la cellule (rect parent passé en prop)
 * - Largeur ~360px, hauteur max ~400px avec scroll interne
 * - Auto-resize textarea, Enter envoie, Shift+Enter retour ligne
 * - Esc ou clic dehors = ferme
 */
export default function CommentsPopover({
  obligationId,
  obligationLabel,
  currentUserEmail,
  anchorRect,
  onClose,
  onCountChange,
}: {
  obligationId: string;
  obligationLabel: string;
  currentUserEmail: string | null;
  /** BoundingClientRect de la cellule qui a déclenché l'ouverture (pour ancrer le popover) */
  anchorRect: { left: number; top: number; bottom: number; right: number } | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position du popover en fixed, ancrée près de la cellule. Calculée 1×.
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!anchorRect) return;
    // Popover ~360px wide. On le centre horizontalement sur la cellule, en
    // restant dans le viewport (8px de marge sur les côtés).
    const POPOVER_WIDTH = 380;
    const POPOVER_HEIGHT = 380; // estimation pour décider openUp
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left + (anchorRect.right - anchorRect.left) / 2 - POPOVER_WIDTH / 2;
    left = Math.max(margin, Math.min(left, vw - POPOVER_WIDTH - margin));

    const spaceBelow = vh - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    const top = openUp ? anchorRect.top - 4 : anchorRect.bottom + 4;

    setPos({ left, top, openUp });
  }, [anchorRect]);

  // Fetch les commentaires
  useEffect(() => {
    listComments(obligationId)
      .then((c) => {
        setComments(c);
        onCountChange?.(c.length);
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      })
      .catch((e) => setError(e.message));
  }, [obligationId, onCountChange]);

  // Focus auto
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Esc + clic dehors → ferme
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Léger délai pour ne pas attraper le clic d'ouverture
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [draft]);

  function submit() {
    const content = draft.trim();
    if (!content) return;
    setError(null);
    startTransition(async () => {
      try {
        const c = await addComment(obligationId, content);
        setComments((prev) => [...(prev ?? []), c]);
        onCountChange?.((comments?.length ?? 0) + 1);
        setDraft("");
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onDelete(commentId: string) {
    startTransition(async () => {
      try {
        await deleteComment(commentId);
        setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? null);
        onCountChange?.((comments?.length ?? 1) - 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Sans rect d'ancrage, on ne rend rien (rare en pratique).
  if (!pos) return null;

  return (
    <>
      {/* Pas d'overlay sombre : Notion-style popover compact, ne bloque pas la
          vue de la table en arrière-plan. */}
      <div
        ref={popoverRef}
        style={{
          position: "fixed",
          left: `${pos.left}px`,
          top: `${pos.top}px`,
          transform: pos.openUp ? "translateY(-100%)" : "translateY(0)",
          zIndex: 1000,
        }}
        className={cn(
          "w-[380px] max-w-[calc(100vw-16px)] bg-white border border-zinc-200 rounded-lg shadow-xl",
          "flex flex-col max-h-[420px] animate-slide-up-fade"
        )}
        role="dialog"
        aria-label="Commentaires"
      >
        {/* Header compact (label de la cellule) */}
        <header className="px-3 py-2 border-b border-zinc-100 flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold">
              Commentaires · {comments?.length ?? 0}
            </div>
            <div className="text-xs font-medium text-zinc-700 truncate" title={obligationLabel}>
              {obligationLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Liste des commentaires */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-[60px]">
          {comments === null ? (
            <div className="text-[11px] text-zinc-400 text-center py-4">Chargement…</div>
          ) : comments.length === 0 ? (
            <div className="text-[11px] text-zinc-400 text-center py-4">
              Aucun commentaire pour l&apos;instant.
            </div>
          ) : (
            comments.map((c) => {
              const isMine = c.author_email === currentUserEmail;
              const initials = (c.author_email.split("@")[0] || "?")
                .slice(0, 2)
                .toUpperCase();
              return (
                <article key={c.id} className="group/comment flex gap-2">
                  {/* Avatar initiales */}
                  <div className="shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] text-[10px] font-semibold flex items-center justify-center">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-semibold text-zinc-800">
                        {isMine ? "Moi" : c.author_email.split("@")[0]}
                      </span>
                      <time
                        className="text-[10px] text-zinc-400 tabular-nums"
                        dateTime={c.created_at}
                        title={new Date(c.created_at).toLocaleString("fr-FR")}
                      >
                        {formatRelative(c.created_at)}
                      </time>
                      {isMine && (
                        <button
                          onClick={() => onDelete(c.id)}
                          className="ml-auto opacity-0 group-hover/comment:opacity-100 text-[10px] text-zinc-400 hover:text-rose-600 transition-opacity"
                          title="Supprimer"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-zinc-800 whitespace-pre-wrap break-words mt-0.5">
                      {c.content}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Composer compact */}
        <footer className="border-t border-zinc-100 p-2 shrink-0">
          {error && (
            <div className="mb-1.5 text-[10px] text-rose-600 bg-rose-50 px-2 py-1 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md border border-zinc-200 bg-white focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-300 transition">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onTextareaKey}
              placeholder="Ajouter un commentaire…"
              rows={1}
              className="w-full resize-none px-2.5 py-1.5 text-xs bg-transparent focus:outline-none"
              style={{ minHeight: 32 }}
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[10px] text-zinc-400">
                <kbd className="font-mono">↵</kbd> envoyer
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={isPending || !draft.trim()}
                className={cn(
                  "px-2.5 py-0.5 rounded text-[11px] font-medium transition-all",
                  draft.trim()
                    ? "bg-[hsl(var(--gold))] text-white hover:opacity-90"
                    : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                )}
              >
                {isPending ? "…" : "Envoyer"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

/** Date relative à la française. */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 2) return "hier";
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
