"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
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
      {/* Bouton flottant premium : disque sombre + etoile doree avec halo
          doux (glow). Cercle de gradient subtil + ring fine. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant MOON"
          title="Assistant MOON"
          className="group fixed bottom-5 right-5 z-[900] inline-flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 active:scale-95"
        >
          {/* Halo : couronne doree qui pulse subtilement au repos, plus
              marquee au hover */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-[hsl(var(--gold))]/25 blur-xl opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
          />
          {/* Cercle principal : gradient sombre type onyx + ring doree */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 ring-1 ring-[hsl(var(--gold))]/40 shadow-xl group-hover:ring-[hsl(var(--gold))]/70 group-hover:shadow-2xl transition-all duration-300"
          />
          {/* Etoile doree au centre + leger sparkle animation */}
          <Sparkles
            className="relative h-5 w-5 text-[hsl(var(--gold))] drop-shadow-[0_0_8px_hsl(var(--gold)/0.5)] group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300"
            aria-hidden="true"
            strokeWidth={2.5}
          />
        </button>
      )}

      {/* Drawer chat premium : ombres marquees, gradients sobres, typo
          travaillee, animations douces. Taille raisonnable (400x560). */}
      {open && (
        <div className="fixed bottom-0 right-0 z-[900] h-[100dvh] md:h-[560px] md:bottom-5 md:right-5 w-full md:w-[400px] flex flex-col bg-white dark:bg-[hsl(var(--surface-elevated))] border-l md:border md:rounded-3xl border-zinc-200 dark:border-white/[0.08] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden animate-slide-up-fade">
          {/* Header premium : fond sombre type onyx + etoile + sous-titre fin */}
          <header className="relative flex items-center justify-between gap-2 px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 dark:from-black dark:via-zinc-950 dark:to-zinc-900 text-zinc-50">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-zinc-800 dark:bg-zinc-950 ring-1 ring-[hsl(var(--gold))]/40 shrink-0">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-[hsl(var(--gold))]/15 blur-md"
                />
                <Sparkles
                  className="relative h-4 w-4 text-[hsl(var(--gold))]"
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold tracking-tight leading-tight">
                  Assistant MOON
                </div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 mt-0.5">
                  Lecture seule · temps réel
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
                  className="text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Conversation : background avec leger pattern + spacing genereux */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-zinc-50/60 dark:bg-zinc-950/40"
          >
            {messages.length === 0 && (
              <div className="text-center pt-8 pb-2 px-2">
                <div className="relative inline-flex items-center justify-center w-14 h-14 mb-4">
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[hsl(var(--gold))]/15 blur-lg"
                  />
                  <span className="relative inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 ring-1 ring-[hsl(var(--gold))]/30">
                    <Sparkles
                      className="h-5 w-5 text-[hsl(var(--gold))]"
                      aria-hidden="true"
                      strokeWidth={2.5}
                    />
                  </span>
                </div>
                <p className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
                  Comment puis-je t&apos;aider ?
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[260px] mx-auto">
                  Pose une question sur ton CRM.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <Message key={i} role={m.role} content={m.content} />
            ))}

            {loading && (
              <div className="flex items-center gap-2.5 text-xs text-zinc-500 dark:text-zinc-400 px-1">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-950 ring-1 ring-[hsl(var(--gold))]/30">
                  <Sparkles
                    className="h-3 w-3 text-[hsl(var(--gold))] animate-pulse"
                    aria-hidden="true"
                  />
                </span>
                <span className="inline-flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
                </span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-300">
                {error}
              </div>
            )}
          </div>

          {/* Input : zone douce avec ombre interne + bouton or marquant */}
          <div className="border-t border-zinc-200 dark:border-white/[0.06] p-3.5 bg-white dark:bg-[hsl(var(--surface-elevated))]">
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
                className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.03] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-4 focus:ring-[hsl(var(--gold))]/15 focus:border-[hsl(var(--gold))]/60 focus:bg-white dark:focus:bg-white/[0.05] max-h-32 transition-all"
                style={{ minHeight: "40px" }}
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || !draft.trim()}
                aria-label="Envoyer"
                className={cn(
                  "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                  draft.trim() && !loading
                    ? // Actif : meme cercle onyx + etoile or que le bouton flottant.
                      // Coherent dans les 2 modes (pas d'inversion blanc en dark).
                      "bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-[hsl(var(--gold))] ring-1 ring-[hsl(var(--gold))]/40 hover:ring-[hsl(var(--gold))]/70 hover:shadow-lg active:scale-95"
                    : "bg-zinc-100 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                )}
              >
                <Send className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
              </button>
            </div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 px-1 flex items-center gap-2">
              <span><kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.05] text-[9px] font-mono">↵</kbd> envoyer</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.05] text-[9px] font-mono">⇧↵</kbd> saut de ligne</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.05] text-[9px] font-mono">Esc</kbd> fermer</span>
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
      <div className="flex justify-end animate-slide-up-fade">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-50 dark:to-zinc-100 text-white dark:text-zinc-900 text-[13px] leading-relaxed whitespace-pre-wrap shadow-card">
          {content}
        </div>
      </div>
    );
  }
  // Bulle assistant : carte blanche premium avec ombre douce + avatar etoile
  return (
    <div className="flex items-start gap-2 animate-slide-up-fade">
      <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 ring-1 ring-[hsl(var(--gold))]/30 mt-0.5">
        <Sparkles
          className="h-3 w-3 text-[hsl(var(--gold))]"
          aria-hidden="true"
          strokeWidth={2.5}
        />
      </span>
      <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-white dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.06] text-zinc-900 dark:text-zinc-100 text-[13px] leading-relaxed whitespace-pre-wrap shadow-card">
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
