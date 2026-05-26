"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Palette de commandes globale (style Cmd+K / Linear / Notion).
 *
 * Raccourcis :
 *   - Cmd+K (Mac) / Ctrl+K (Win) : ouvrir
 *   - Esc : fermer
 *   - ↑↓ : naviguer
 *   - Enter : ouvrir l'item
 *
 * Affiche en parallèle :
 *   - Des routes statiques (Dashboard, Clients, Pipeline, …)
 *   - Des clients matchés par nom/SIREN (avec leur slug)
 *
 * Le fetch des clients se fait à l'ouverture, en parallèle, mis en cache 30 s.
 */

type ClientHit = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
};

type Item = {
  id: string;
  kind: "route" | "client";
  label: string;
  hint?: string;
  href: string;
};

const STATIC_ROUTES: Item[] = [
  { id: "r-/", kind: "route", label: "Dashboard", hint: "Vue d'ensemble", href: "/" },
  { id: "r-/clients", kind: "route", label: "Clients", hint: "Liste des dossiers", href: "/clients" },
  { id: "r-/pipeline", kind: "route", label: "Pipeline", hint: "Kanban commercial", href: "/pipeline" },
  { id: "r-/onboarding", kind: "route", label: "Onboarding", hint: "Liste des onboardings", href: "/onboarding" },
  { id: "r-/onboarding/matrice", kind: "route", label: "Matrice onboarding", hint: "Vue transverse", href: "/onboarding/matrice" },
  { id: "r-/onboarding/parametrage", kind: "route", label: "Parcours d'onboarding", hint: "Paramétrage des étapes", href: "/onboarding/parametrage" },
  { id: "r-/obligations", kind: "route", label: "Production", hint: "Trackers obligations", href: "/obligations" },
  { id: "r-/parametrage", kind: "route", label: "Paramétrage obligations", hint: "Grille des souscriptions", href: "/parametrage" },
  { id: "r-/clients/nouveau", kind: "route", label: "Nouveau dossier", hint: "Créer un client", href: "/clients/nouveau" },
];

let clientsCache: { at: number; rows: ClientHit[] } | null = null;
const CACHE_MS = 30_000;

async function fetchClients(): Promise<ClientHit[]> {
  if (clientsCache && Date.now() - clientsCache.at < CACHE_MS) {
    return clientsCache.rows;
  }
  const sb = createClient();
  const { data } = await sb
    .from("clients")
    .select("id, slug, denomination, siren")
    .order("denomination");
  const rows = (data ?? []) as ClientHit[];
  clientsCache = { at: Date.now(), rows };
  return rows;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientHit[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Ouverture via Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fetch clients à l'ouverture (avec cache 30 s)
  useEffect(() => {
    if (!open) return;
    fetchClients().then(setClients).catch(() => setClients([]));
  }, [open]);

  // Reset query + focus à l'ouverture
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Items filtrés
  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const routesMatch = q
      ? STATIC_ROUTES.filter((r) =>
          (r.label + " " + (r.hint ?? "")).toLowerCase().includes(q)
        )
      : STATIC_ROUTES.slice(0, 5);
    const clientsMatch = q
      ? clients
          .filter((c) => {
            const hay = `${c.denomination} ${c.siren ?? ""}`.toLowerCase();
            return hay.includes(q);
          })
          .slice(0, 8)
          .map<Item>((c) => ({
            id: `c-${c.id}`,
            kind: "client",
            label: c.denomination,
            hint: c.siren ?? undefined,
            href: `/clients/${c.slug}`,
          }))
      : [];
    return [...routesMatch, ...clientsMatch];
  }, [query, clients]);

  // Reset selection quand items changent
  useEffect(() => {
    setSelectedIdx(0);
  }, [items.length]);

  // Scroll into view
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selectedIdx];
      if (item) {
        router.push(item.href);
        setOpen(false);
      }
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-start justify-center p-4 pt-[12vh] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
    >
      <div
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-slide-up-fade"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un client, une page…"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-zinc-400"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-[10px] text-zinc-500 font-medium">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-zinc-400">
              Aucun résultat pour <span className="font-medium">{query}</span>.
            </div>
          ) : (
            <div>
              {/* Section routes */}
              {items.some((i) => i.kind === "route") && (
                <SectionHeader label="Navigation" />
              )}
              {items
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => it.kind === "route")
                .map(({ it, i }) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    idx={i}
                    selected={selectedIdx === i}
                    onSelect={() => {
                      router.push(it.href);
                      setOpen(false);
                    }}
                    onHover={() => setSelectedIdx(i)}
                  />
                ))}
              {/* Section clients */}
              {items.some((i) => i.kind === "client") && (
                <SectionHeader label="Clients" />
              )}
              {items
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => it.kind === "client")
                .map(({ it, i }) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    idx={i}
                    selected={selectedIdx === i}
                    onSelect={() => {
                      router.push(it.href);
                      setOpen(false);
                    }}
                    onHover={() => setSelectedIdx(i)}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-3 py-2 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="inline-block px-1 rounded border border-zinc-200 bg-white">↑</kbd>
              <kbd className="inline-block px-1 rounded border border-zinc-200 bg-white">↓</kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-block px-1 rounded border border-zinc-200 bg-white">↵</kbd>
              ouvrir
            </span>
          </div>
          <div>
            {clients.length > 0 && `${clients.length} clients indexés`}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-zinc-400 font-medium">
      {label}
    </div>
  );
}

function ItemRow({
  item,
  idx,
  selected,
  onSelect,
  onHover,
}: {
  item: Item;
  idx: number;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <Link
      href={item.href}
      data-idx={idx}
      onClick={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
        selected ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.label}</div>
        {item.hint && (
          <div className="text-[11px] text-zinc-500 truncate">{item.hint}</div>
        )}
      </div>
      {selected && <ArrowRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
    </Link>
  );
}
