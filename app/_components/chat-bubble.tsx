"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Assistant CRM flottant style Intercom :
 *   - Bouton rond en bas-droite (or)
 *   - Clic ouvre un panel drawer a droite (largeur 440px desktop, plein
 *     ecran mobile)
 *   - Conversation locale (pas de persistance pour MVP)
 *   - Streaming desactive en etape 1 (reponse complete d'un coup)
 *
 * L'API /api/chat est appelee avec la conversation complete a chaque tour.
 * Claude peut appeler des outils (lecture seule en etape 1) et nous renvoie
 * une reponse textuelle finale.
 */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "moon.chat.history";
const MAX_PERSISTED = 20;

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore historique au mount (limite a MAX_PERSISTED messages)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_PERSISTED));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist a chaque update
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_PERSISTED))
      );
    } catch {
      // ignore (quota)
    }
  }, [messages]);

  // Scroll vers le bas a chaque nouveau message
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  // Focus input quand on ouvre
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    const text = draft.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur inconnue");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text ?? "(reponse vide)" },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <>
      {/* Bulle flottante : visible en permanence */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant"
          className="fixed bottom-5 right-5 z-[900] inline-flex items-center justify-center w-14 h-14 rounded-full bg-[hsl(var(--gold))] text-zinc-900 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {/* Drawer chat */}
      {open && (
        <div className="fixed bottom-0 right-0 z-[900] h-[100dvh] md:h-[640px] md:bottom-4 md:right-4 w-full md:w-[440px] flex flex-col bg-white dark:bg-[hsl(var(--surface-elevated))] border-l md:border md:rounded-2xl border-zinc-200 dark:border-white/[0.10] shadow-2xl overflow-hidden animate-slide-in-right">
          {/* Header */}
          <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 dark:border-white/[0.08] bg-gradient-to-br from-[hsl(var(--gold))]/10 via-transparent to-transparent">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--gold))]/15">
                <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--gold-dark))]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Assistant MOON</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Lecture seule · données en temps réel
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Nouvelle conversation"
                  title="Nouvelle conversation"
                  className="text-[11px] px-2 py-1 rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="p-1.5 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Conversation */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/40 dark:bg-transparent"
          >
            {messages.length === 0 && (
              <div className="text-center py-8 px-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[hsl(var(--gold))]/10 mb-3">
                  <Sparkles className="h-5 w-5 text-[hsl(var(--gold-dark))]" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Pose-moi une question sur ton CRM
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Exemples ci-dessous, ou tape ta question.
                </p>
                <div className="mt-4 grid gap-1.5 text-left">
                  {[
                    "Quel est mon MRR ?",
                    "Quelles obligations en retard ?",
                    "Combien j'ai signé ce mois ?",
                    "Où en est l'onboarding de Massimo ?",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDraft(q)}
                      className="text-xs text-left px-3 py-2 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] hover:border-[hsl(var(--gold))]/40 hover:bg-zinc-50 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Message key={i} role={m.role} content={m.content} />
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: "300ms" }} />
                </span>
                Réflexion…
              </div>
            )}

            {error && (
              <div className="rounded-md border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-200 dark:border-white/[0.08] p-3 bg-white dark:bg-[hsl(var(--surface-elevated))]">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Pose ta question…"
                disabled={loading}
                rows={1}
                className="flex-1 resize-none px-3 py-2 rounded-lg border border-zinc-300 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60 max-h-32"
                style={{ minHeight: "38px" }}
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || !draft.trim()}
                aria-label="Envoyer"
                className={cn(
                  "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
                  draft.trim() && !loading
                    ? "bg-[hsl(var(--gold))] text-zinc-900 hover:bg-[hsl(var(--gold-dark))]"
                    : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                )}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 px-1">
              ↵ envoyer · Maj+↵ saut de ligne · Esc fermer
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
//  Message — bulle simple. Markdown basique : **gras**, listes, sauts de ligne.
// ============================================================================

function Message({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-sm bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }
  // Rendu naïf du markdown : on ne tire pas une lib pour le MVP.
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 text-sm whitespace-pre-wrap">
        {renderInlineMarkdown(content)}
      </div>
    </div>
  );
}

/**
 * Rendu markdown TRES basique : **gras** + sauts de ligne. Pas de lib pour
 * eviter d'alourdir le bundle. Si besoin de plus tard, on passera a
 * react-markdown.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
