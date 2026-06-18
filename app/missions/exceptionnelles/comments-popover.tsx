"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addMissionExcComment,
  deleteMissionExcComment,
  listMissionExcComments,
  type MissionExcComment,
} from "./comments-actions";

/**
 * Popover commentaires sur une mission exceptionnelle.
 *
 * Copie adaptee du CommentsPopover des obligations (obligations/[tracker]/
 * comments-panel.tsx). Meme UX, juste les server actions remplacees.
 *
 * Architecture perf-critique (heritee) :
 *   - Composer isole avec son propre state local -> taper ne re-render pas
 *     le parent.
 *   - Chaque CommentItem est memo.
 *   - Refocus apres submit pour enchainer.
 */
export default function MissionExcCommentsPopover({
  missionId,
  missionLabel,
  currentUserEmail,
  canComment = true,
  anchorRect,
  onClose,
  onCountChange,
}: {
  missionId: string;
  missionLabel: string;
  currentUserEmail: string | null;
  /** Droit d'écrire/supprimer un commentaire (edit_production). La lecture
   *  reste toujours possible : seuls l'envoi et la suppression sont bloqués. */
  canComment?: boolean;
  anchorRect: { left: number; top: number; bottom: number; right: number } | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<MissionExcComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!anchorRect) return;
    const POPOVER_WIDTH = 380;
    const POPOVER_HEIGHT = 380;
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

  useEffect(() => {
    let cancelled = false;
    listMissionExcComments(missionId)
      .then((c) => {
        if (cancelled) return;
        setComments(c);
        onCountChange?.(c.length);
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

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
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      try {
        const c = await addMissionExcComment(missionId, content);
        setComments((prev) => {
          const next = [...(prev ?? []), c];
          onCountChange?.(next.length);
          return next;
        });
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [missionId, onCountChange],
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        await deleteMissionExcComment(commentId);
        setComments((prev) => {
          const next = prev?.filter((c) => c.id !== commentId) ?? null;
          onCountChange?.(next?.length ?? 0);
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [onCountChange],
  );

  if (!pos) return null;

  return (
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
        "w-[380px] max-w-[calc(100vw-16px)] bg-white dark:bg-[hsl(var(--surface-elevated))]",
        "border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-xl",
        "flex flex-col max-h-[420px] animate-slide-up-fade",
      )}
      role="dialog"
      aria-label="Commentaires mission"
    >
      <header className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06] flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold">
            Commentaires ({comments?.length ?? 0})
          </div>
          <div
            className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate"
            title={missionLabel}
          >
            {missionLabel}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors shrink-0"
          aria-label="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-[60px]">
        {comments === null ? (
          <div className="text-[11px] text-zinc-400 text-center py-4">Chargement…</div>
        ) : comments.length === 0 ? (
          <div className="text-[11px] text-zinc-400 text-center py-4">
            Aucun commentaire pour l&apos;instant.
          </div>
        ) : (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              isMine={c.author_email === currentUserEmail}
              canDelete={canComment}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <Composer
        onSend={handleSend}
        error={error}
        clearError={() => setError(null)}
        disabled={!canComment}
      />
    </div>
  );
}

// ============================================================================
//  Sous-composants (= heritage du popover obligations)
// ============================================================================

const CommentItem = memo(function CommentItem({
  comment,
  isMine,
  canDelete,
  onDelete,
}: {
  comment: MissionExcComment;
  isMine: boolean;
  /** Droit de supprimer (edit_production). Si false, pas de bouton Supprimer. */
  canDelete: boolean;
  onDelete: (commentId: string) => void;
}) {
  const initials = (comment.author_email.split("@")[0] || "?").slice(0, 2).toUpperCase();
  return (
    <article className="group/comment flex gap-2">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] text-[10px] font-semibold flex items-center justify-center">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">
            {isMine ? "Moi" : comment.author_email.split("@")[0]}
          </span>
          <time
            className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums"
            dateTime={comment.created_at}
            title={new Date(comment.created_at).toLocaleString("fr-FR")}
          >
            {formatRelative(comment.created_at)}
          </time>
          {isMine && canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="ml-auto opacity-0 group-hover/comment:opacity-100 text-[10px] text-zinc-400 hover:text-rose-600 transition-opacity"
              title="Supprimer"
            >
              Supprimer
            </button>
          )}
        </div>
        <div className="text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words mt-0.5">
          {comment.content}
        </div>
      </div>
    </article>
  );
});

function Composer({
  onSend,
  error,
  clearError,
  disabled = false,
}: {
  onSend: (content: string) => Promise<boolean>;
  error: string | null;
  clearError: () => void;
  /** Droit d'écrire manquant : champ + bouton désactivés. */
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [draft]);

  async function submit() {
    const content = draft.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    if (error) clearError();
    const ok = await onSend(content);
    setSending(false);
    if (ok) {
      setDraft("");
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <footer className="border-t border-zinc-100 dark:border-white/[0.06] p-2 shrink-0">
      {error && (
        <div className="mb-1.5 text-[10px] text-rose-600 bg-rose-50 dark:bg-rose-500/15 px-2 py-1 rounded">
          {error}
        </div>
      )}
      <div className="rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] focus-within:border-zinc-400 dark:focus-within:border-white/[0.20] transition">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={disabled ? "Lecture seule" : "Ajouter un commentaire…"}
          rows={1}
          className="w-full resize-none px-2.5 py-1.5 text-xs bg-transparent focus:outline-none text-zinc-900 dark:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ minHeight: 32 }}
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            <kbd className="font-mono">↵</kbd> envoyer
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={sending || !draft.trim() || disabled}
            className={cn(
              "px-2.5 py-0.5 rounded text-[11px] font-medium transition-all",
              draft.trim() && !sending && !disabled
                ? "bg-[hsl(var(--gold))] text-white hover:opacity-90"
                : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-400 cursor-not-allowed",
            )}
          >
            {sending ? "…" : "Envoyer"}
          </button>
        </div>
      </div>
    </footer>
  );
}

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
