"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, PIPELINE_COLORS } from "@/lib/utils";

type ClientLite = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  pipeline_statut: string | null;
};

/**
 * Sélecteur de dossier global · raccourci Ctrl/⌘ + F pour ouvrir-focus.
 * Filtre fuzzy par dénomination ou SIREN. Navigation clavier : ↑ ↓ Entrée Échap.
 */
export function ClientSwitcher() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Chargement initial des dossiers (cache simple en mémoire)
  useEffect(() => {
    const sb = createClient();
    sb.from("clients")
      .select("id, slug, denomination, siren, pipeline_statut")
      .order("denomination")
      .then(({ data }) => setClients((data as ClientLite[]) ?? []));
  }, []);

  // Raccourci Ctrl/⌘ + F : focus + sélection + ouverture. Désactivé sur
  // touch (mobile/tablette) car ça intercepterait la recherche navigateur.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fermeture si clic en dehors
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 25);
    return clients
      .filter(
        (c) =>
          c.denomination.toLowerCase().includes(q) ||
          (c.siren ?? "").includes(q)
      )
      .slice(0, 25);
  }, [clients, query]);

  function onSelect(c: ClientLite) {
    router.push(`/clients/${c.slug}`);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[highlightIdx]) {
      e.preventDefault();
      onSelect(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full md:w-72 max-w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Aller au dossier…"
          className="w-full pl-8 pr-3 md:pr-12 py-1.5 rounded-md border border-zinc-300 bg-white text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        {/* Indicateur de raccourci - caché sur touch */}
        <kbd className="hidden md:inline-block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5 font-mono pointer-events-none">
          Ctrl F
        </kbd>
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-96 max-w-[calc(100vw-1.5rem)] rounded-lg border bg-white shadow-xl overflow-hidden animate-slide-up-fade">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-zinc-500 text-center">
              {clients.length === 0 ? "Chargement…" : "Aucun dossier."}
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-auto py-1">
              {filtered.map((c, i) => (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c)}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2",
                      i === highlightIdx
                        ? "bg-[hsl(var(--gold))]/10"
                        : "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "text-sm font-medium truncate",
                          i === highlightIdx
                            ? "text-[hsl(var(--gold-dark))]"
                            : "text-zinc-800"
                        )}
                      >
                        {c.denomination}
                      </div>
                      {c.siren && (
                        <div className="text-[11px] text-zinc-500 tabular-nums">
                          {c.siren}
                        </div>
                      )}
                    </div>
                    {c.pipeline_statut && (
                      <span
                        className={cn(
                          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border",
                          PIPELINE_COLORS[c.pipeline_statut] ??
                            "bg-zinc-100 text-zinc-600 border-zinc-200"
                        )}
                      >
                        {c.pipeline_statut.replace(/^[0-9Z] - /, "")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-3 py-1.5 border-t bg-zinc-50/60 text-[10px] text-zinc-500 flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white border border-zinc-200 font-mono">
                ↑↓
              </kbd>{" "}
              naviguer
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white border border-zinc-200 font-mono">
                ↵
              </kbd>{" "}
              ouvrir
            </span>
            <span className="ml-auto">
              {filtered.length} / {clients.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
