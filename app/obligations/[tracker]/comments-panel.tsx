"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addComment,
  deleteComment,
  listComments,
  type Comment,
} from "@/app/obligations/comments-actions";

/**
 * Panel latéral commentaires style Notion. Ouvert depuis le tracker quand on
 * clique sur l'indicateur 💬 d'une cellule. Slide-over de 380px sur desktop,
 * full-width sur mobile. Système thread chronologique : on tape, on poste.
 *
 * Auto-resize textarea, Cmd/Ctrl+Enter pour envoyer, Esc pour fermer.
 */
export default function CommentsPanel({
  obligationId,
  obligationLabel,
  currentUserEmail,
  onClose,
  onCountChange,
}: {
  obligationId: string;
  obligationLabel: string; // ex. "ADELEX CONSULTING · TVA 11-2026"
  currentUserEmail: string | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Charge les commentaires à l'ouverture
  useEffect(() => {
    listComments(obligationId)
      .then((c) => {
        setComments(c);
        onCountChange?.(c.length);
        // Scroll en bas (dernier commentaire visible)
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      })
      .catch((e) => setError(e.message));
  }, [obligationId, onCountChange]);

  // Focus auto sur le textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Échap pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
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
        // Scroll en bas
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
    // Enter envoie (raccourci principal). Shift+Enter = retour ligne classique.
    // Cmd/Ctrl+Enter envoie aussi (cohérence avec Slack/Linear/Notion).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      {/* Overlay mobile (clic = ferme) */}
      <div
        className="fixed inset-0 z-40 bg-black/30 md:bg-transparent md:pointer-events-none"
        onClick={onClose}
        aria-hidden
      />
      {/* Slide-over */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col",
          "w-full md:w-[400px] lg:w-[440px]",
          "border-l border-zinc-200",
          "animate-slide-in-right"
        )}
        role="dialog"
        aria-label="Commentaires"
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-zinc-200 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              Commentaires
            </div>
            <div className="text-sm font-medium text-zinc-800 truncate" title={obligationLabel}>
              {obligationLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Liste des commentaires */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {comments === null ? (
            <div className="text-xs text-zinc-400 text-center py-8">Chargement…</div>
          ) : comments.length === 0 ? (
            <div className="text-xs text-zinc-400 text-center py-8">
              Aucun commentaire pour l&apos;instant.
            </div>
          ) : (
            comments.map((c) => {
              const isMine = c.author_email === currentUserEmail;
              return (
                <article key={c.id} className="group/comment">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-zinc-800">
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
                  <div className="text-sm text-zinc-800 whitespace-pre-wrap break-words">
                    {c.content}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Composer */}
        <footer className="border-t border-zinc-200 p-3">
          {error && (
            <div className="mb-2 text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded">
              {error}
            </div>
          )}
          <div className="rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200 transition">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onTextareaKey}
              placeholder="Ajouter un commentaire…"
              rows={1}
              className="w-full resize-none px-3 py-2 text-sm bg-transparent focus:outline-none"
              style={{ minHeight: 36 }}
            />
            <div className="flex items-center justify-between px-2 py-1.5 border-t border-zinc-100">
              <div className="flex items-center gap-1 text-zinc-400">
                <button
                  type="button"
                  className="p-1 rounded hover:bg-zinc-100 transition-colors"
                  title="Pas encore implémenté"
                  disabled
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 hidden sm:inline">
                  <kbd className="font-mono">↵</kbd> pour envoyer · <kbd className="font-mono">⇧↵</kbd> retour ligne
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending || !draft.trim()}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    draft.trim()
                      ? "bg-[hsl(var(--gold))] text-white hover:opacity-90"
                      : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  {isPending ? "…" : "Envoyer"}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </aside>
    </>
  );
}

/** Date relative à la française (il y a X minutes/heures, hier, etc.). */
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
