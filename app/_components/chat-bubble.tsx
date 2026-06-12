"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Mic, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mutation faite par Jarvis et renvoyee par /api/chat. */
type JarvisChange = {
  kind: "obligation_status" | "client_pipeline";
  title: string;
  description: string;
  href: string;
};

/** Toast affiche en haut a droite apres une action Jarvis. */
type Toast = JarvisChange & { id: number; expiresAt: number };

const TOAST_DURATION_MS = 12000;

/**
 * Assistant CRM "Jarvis" flottant.
 *
 *   - Bouton rond en bas-droite (or)
 *   - Clic ouvre un panel drawer a droite
 *   - Voice in : Web Speech API. Push-to-talk Ctrl+Shift+V (hold pour parler,
 *     release pour envoyer auto). Ou clic sur bouton micro.
 *   - Voice out : SpeechSynthesis API. Toggle dans le header (icone son).
 *   - Conversation persistee localStorage (20 derniers messages).
 *
 * L'API /api/chat est appelee avec la conversation complete a chaque tour.
 * Claude peut appeler des outils (lecture + ecriture) et nous renvoie une
 * reponse textuelle finale.
 */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "moon.chat.history";
const TTS_PREF_KEY = "moon.chat.tts";
const MAX_PERSISTED = 20;

// ============================================================================
//  Speech recognition (Web Speech API) - types minimaux
// ============================================================================

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
    length: number;
  }>;
};

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // Chrome / Edge / Safari (webkit prefix)
  const ctor =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition;
  return ctor ?? null;
}

// ============================================================================
//  Voice picker - choisit la meilleure voix FR masculine dispo
// ============================================================================
//
// La voix par defaut du navigateur est souvent un truc robotique random.
// On filtre les voix dispo et on prend la meilleure homme FR :
//   1. Voix "premium" / "neural" / "online" (qualite Microsoft Edge / Apple)
//   2. Noms masculins connus : Thomas, Henri, Daniel, Aaron, Paul, Jacques...
//   3. Defaut : 1ere voix FR

// Voix homme FR connues sur les principales plateformes
const FR_MALE_VOICE_HINTS = [
  // macOS / iOS - Apple Voices
  "thomas",      // fr-FR premium male
  "aaron",       // fr-CA male
  // Windows / Edge - Microsoft Neural
  "henri",       // Microsoft Henri (fr-FR)
  "paul",        // fr-CA
  "claude",      // Microsoft Claude (fr-FR neural)
  // Chrome / Google
  "français",    // souvent suivi de "Homme" sur Chrome
  // Generiques
  "male",
  "homme",
];

const PREMIUM_KEYWORDS = [
  "premium",
  "enhanced",
  "neural",
  "online",
  "natural",
  "high quality",
];

function pickFrenchMaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // 1. Filtre FR
  const fr = voices.filter((v) => v.lang.toLowerCase().startsWith("fr"));
  if (!fr.length) return null;

  function score(v: SpeechSynthesisVoice): number {
    const name = v.name.toLowerCase();
    let s = 0;
    // Match nom masculin connu : +100
    if (FR_MALE_VOICE_HINTS.some((h) => name.includes(h))) s += 100;
    // Pas de marqueur feminin : +10
    const female = ["female", "femme", "amelie", "audrey", "marie", "celine", "julie"];
    if (!female.some((f) => name.includes(f))) s += 10;
    // Premium / neural : +50
    if (PREMIUM_KEYWORDS.some((k) => name.includes(k))) s += 50;
    // fr-FR > fr-CA > fr-BE : +5
    if (v.lang.toLowerCase() === "fr-fr") s += 5;
    return s;
  }

  return [...fr].sort((a, b) => score(b) - score(a))[0] ?? fr[0];
}

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [interimText, setInterimText] = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  // Texte accumule par la session courante (interim + final). On lit le
  // ref dans onend pour decider d'envoyer auto.
  const finalTextRef = useRef("");
  // Flag : la session courante a-t-elle ete demarree volontairement
  // (raccourci clavier ou bouton). Empeche les onend phantom.
  const recordingRef = useRef(false);

  // ----- Restore + persistance localStorage + warmup voix TTS
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_PERSISTED));
      }
      setTtsEnabled(localStorage.getItem(TTS_PREF_KEY) === "1");
    } catch {
      // ignore
    }
    // Les voix TTS se chargent async. On force un getVoices() initial + on
    // ecoute voiceschanged pour s'assurer que pickFrenchMaleVoice trouve
    // bien la voix masculine FR au 1er appel.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const onVoices = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      };
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_PERSISTED))
      );
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_PREF_KEY, ttsEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [ttsEnabled]);

  // ----- Auto-scroll + auto-focus
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open, interimText]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ----- Envoi conversation (memoize : utilise dans plusieurs callbacks)
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();
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
        const reply = data.text ?? "(reponse vide)";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);

        // Mutations effectuees -> toast en haut a droite + refresh des
        // server components de la page courante pour voir le changement
        // en live sans avoir a F5.
        const changes: JarvisChange[] = Array.isArray(data.changes) ? data.changes : [];
        if (changes.length > 0) {
          const now = Date.now();
          setToasts((prev) => [
            ...prev,
            ...changes.map((c, i) => ({
              ...c,
              id: now + i,
              expiresAt: now + TOAST_DURATION_MS,
            })),
          ]);
          // router.refresh() re-fetch les server components -> /obligations,
          // tracker pages, /pipeline, etc. La maj est visible en moins d'1s.
          router.refresh();
        }

        // Voice out : lecture si toggle actif. Selection d'une voix
        // masculine FR (cf. pickFrenchMaleVoice) - sinon le browser prend
        // sa voix par defaut qui est souvent feminine et robotique.
        if (ttsEnabled && reply && typeof window !== "undefined" && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(reply);
            const voice = pickFrenchMaleVoice();
            if (voice) utt.voice = voice;
            utt.lang = voice?.lang ?? "fr-FR";
            utt.rate = 1.0;
            utt.pitch = 0.95;
            window.speechSynthesis.speak(utt);
          } catch {
            // ignore TTS failures
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [draft, loading, messages, ttsEnabled, router]
  );

  // Auto-cleanup des toasts expires
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, 500);
    return () => clearInterval(t);
  }, [toasts.length]);

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }
  function onToastClick(t: Toast) {
    router.push(t.href);
    dismissToast(t.id);
  }

  // ----- Voice in : init recognition + start/stop
  const ensureRecognition = useCallback((): SpeechRecognitionInstance | null => {
    if (recogRef.current) return recogRef.current;
    const Ctor = getSpeechRecognition();
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) final += txt;
        else interim += txt;
      }
      if (final) {
        finalTextRef.current = (finalTextRef.current + " " + final).trim();
      }
      setInterimText(interim);
      setDraft((finalTextRef.current + " " + interim).trim());
    };
    r.onerror = (ev) => {
      // "no-speech" / "aborted" sont normaux, on les ignore
      if (ev.error && ev.error !== "no-speech" && ev.error !== "aborted") {
        setError(`Voix : ${ev.error}`);
      }
    };
    r.onend = () => {
      setRecording(false);
      recordingRef.current = false;
      setInterimText("");
      // Si on a accumule du texte, on envoie auto. Sinon on laisse le user
      // taper / re-essayer.
      const text = finalTextRef.current.trim();
      finalTextRef.current = "";
      if (text) {
        send(text);
      }
    };
    recogRef.current = r;
    return r;
  }, [send]);

  const startRecording = useCallback(() => {
    if (recordingRef.current) return;
    const r = ensureRecognition();
    if (!r) {
      setError(
        "Reconnaissance vocale indisponible sur ce navigateur. Utilise Chrome / Edge / Safari."
      );
      return;
    }
    // Reset accumulateur + draft
    finalTextRef.current = "";
    setDraft("");
    setInterimText("");
    setError(null);
    try {
      r.start();
      recordingRef.current = true;
      setRecording(true);
    } catch {
      // Deja en cours -> ignore
    }
  }, [ensureRecognition]);

  const stopRecording = useCallback(() => {
    const r = recogRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      // ignore
    }
  }, []);

  // ----- Raccourcis clavier globaux
  //  Ctrl+Shift+V (ou Cmd+Shift+V) : push-to-talk - hold pour parler, release
  //  pour envoyer. Marche meme si le chat est ferme (ouvre automatiquement).
  //  Esc : ferme le chat (ou arrete l'enregistrement en cours).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrlish = e.ctrlKey || e.metaKey;
      if (ctrlish && e.shiftKey && (e.key === "V" || e.key === "v")) {
        e.preventDefault();
        if (!open) setOpen(true);
        // Hold to talk : on demarre si pas deja en cours. onend (release de
        // touche) declenchera l'arret.
        if (!recordingRef.current) startRecording();
      }
      if (e.key === "Escape") {
        if (recordingRef.current) {
          // Abort sans envoyer
          finalTextRef.current = "";
          recogRef.current?.abort();
          setRecording(false);
          recordingRef.current = false;
          setInterimText("");
          setDraft("");
          return;
        }
        if (open) setOpen(false);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      const ctrlish = e.ctrlKey || e.metaKey;
      // Quand on release Ctrl OU Shift OU V pendant le push-to-talk, on stop
      if (recordingRef.current && (!ctrlish || !e.shiftKey || e.key === "V" || e.key === "v")) {
        stopRecording();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open, startRecording, stopRecording]);

  function reset() {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function toggleMicClick() {
    if (recording) stopRecording();
    else startRecording();
  }

  return (
    <>
      {/* Stack de toasts en haut a droite. Apparait apres chaque mutation
          Jarvis (set_obligation_status, set_client_pipeline_statut...).
          Cliquer = navigation deep-link vers la cellule modifiee. */}
      <div className="fixed top-16 right-4 z-[950] flex flex-col gap-2 max-w-[360px] pointer-events-none">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToastClick(t)}
            className="pointer-events-auto text-left animate-slide-up-fade group/toast rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-[0_12px_40px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.7)] hover:border-[hsl(var(--gold))]/40 hover:shadow-[0_16px_50px_-10px_rgba(0,0,0,0.3)] transition-all px-3.5 py-3 flex items-start gap-3"
          >
            <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 mt-0.5">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-400 leading-tight">
                {t.title}
              </div>
              <div className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-snug mt-0.5">
                {t.description}
              </div>
              <div className="text-[10px] text-[hsl(var(--gold))] dark:text-[hsl(var(--gold))] flex items-center gap-1 mt-1.5 group-hover/toast:translate-x-0.5 transition-transform">
                Voir <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </div>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(t.id);
              }}
              role="button"
              tabIndex={0}
              aria-label="Fermer"
              className="shrink-0 p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>

      {/* Bouton flottant : disque sombre + etoile doree avec halo */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant MOON (Ctrl+Shift+V pour parler)"
          title="Assistant MOON (Ctrl+Shift+V pour parler)"
          className="group fixed bottom-5 right-5 z-[900] inline-flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 active:scale-95"
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-[hsl(var(--gold))]/25 blur-xl opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 ring-1 ring-[hsl(var(--gold))]/40 shadow-xl group-hover:ring-[hsl(var(--gold))]/70 group-hover:shadow-2xl transition-all duration-300"
          />
          <Sparkles
            className="relative h-5 w-5 text-[hsl(var(--gold))] drop-shadow-[0_0_8px_hsl(var(--gold)/0.5)] group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300"
            aria-hidden="true"
            strokeWidth={2.5}
          />
        </button>
      )}

      {/* Drawer chat */}
      {open && (
        <div className="fixed bottom-0 right-0 z-[900] h-[100dvh] md:h-[560px] md:bottom-5 md:right-5 w-full md:w-[400px] flex flex-col bg-white dark:bg-[hsl(var(--surface-elevated))] border-l md:border md:rounded-3xl border-zinc-200 dark:border-white/[0.08] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden animate-slide-up-fade">
          {/* Header */}
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
                  Jarvis
                </div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 mt-0.5">
                  Vocal · ⌃⇧V parler
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setTtsEnabled((v) => !v)}
                aria-label={ttsEnabled ? "Couper le son" : "Activer la lecture vocale"}
                title={ttsEnabled ? "Lecture vocale activée" : "Lecture vocale désactivée"}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  ttsEnabled
                    ? "text-[hsl(var(--gold))] bg-white/[0.06] hover:bg-white/[0.12]"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                )}
              >
                {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
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

          {/* Conversation */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-zinc-50/60 dark:bg-zinc-950/40"
          >
            {messages.length === 0 && (
              <div className="text-center pt-6 pb-2 px-2">
                <div className="relative inline-flex items-center justify-center w-14 h-14 mb-3">
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
                  Que veux-tu faire&nbsp;?
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px] mx-auto">
                  Tape, ou maintiens <kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-white/[0.06] text-[10px] font-mono">⌃⇧V</kbd> pour dicter.
                </p>
                <div className="mt-4 grid gap-1.5 text-left">
                  {[
                    "TVA Soulez Lariviere de mai déclarée",
                    "Passe Borio en LDM signée",
                    "Quelles obligations en retard ?",
                    "Mon MRR",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setDraft(q);
                        inputRef.current?.focus();
                      }}
                      className="group/sugg flex items-center gap-2 text-[13px] text-left px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.06] hover:border-[hsl(var(--gold))]/40 hover:bg-zinc-50 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 transition-all"
                    >
                      <Sparkles
                        className="h-3 w-3 text-[hsl(var(--gold))]/70 group-hover/sugg:text-[hsl(var(--gold))] shrink-0 transition-colors"
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{q}</span>
                    </button>
                  ))}
                </div>
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

          {/* Input */}
          <div className="border-t border-zinc-200 dark:border-white/[0.06] p-3.5 bg-white dark:bg-[hsl(var(--surface-elevated))]">
            {recording && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                Écoute… <span className="text-rose-400 dark:text-rose-300/70">(release pour envoyer · Esc pour annuler)</span>
              </div>
            )}
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
                placeholder={recording ? "Parle…" : "Tape ou ⌃⇧V pour dicter…"}
                disabled={loading}
                rows={1}
                className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.03] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-4 focus:ring-[hsl(var(--gold))]/15 focus:border-[hsl(var(--gold))]/60 focus:bg-white dark:focus:bg-white/[0.05] max-h-32 transition-all"
                style={{ minHeight: "40px" }}
              />
              <button
                type="button"
                onClick={toggleMicClick}
                disabled={loading}
                aria-label={recording ? "Arreter l'enregistrement" : "Dicter (Ctrl+Shift+V)"}
                title={recording ? "Arreter" : "Dicter (Ctrl+Shift+V)"}
                className={cn(
                  "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                  recording
                    ? "bg-rose-500 text-white ring-1 ring-rose-300 animate-pulse"
                    : "bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <Mic className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => send()}
                disabled={loading || !draft.trim()}
                aria-label="Envoyer"
                className={cn(
                  "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                  draft.trim() && !loading
                    ? "bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-[hsl(var(--gold))] ring-1 ring-[hsl(var(--gold))]/40 hover:ring-[hsl(var(--gold))]/70 hover:shadow-lg active:scale-95"
                    : "bg-zinc-100 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                )}
              >
                <Send className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
              </button>
            </div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 px-1 flex items-center gap-2 flex-wrap">
              <span><kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.05] text-[9px] font-mono">↵</kbd> envoyer</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.05] text-[9px] font-mono">⌃⇧V</kbd> dicter</span>
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
//  Message
// ============================================================================

function Message({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end animate-slide-up-fade">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-zinc-900 dark:bg-zinc-800 text-zinc-50 text-[13px] leading-relaxed whitespace-pre-wrap shadow-card ring-1 ring-[hsl(var(--gold))]/20">
          {content}
        </div>
      </div>
    );
  }
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

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
