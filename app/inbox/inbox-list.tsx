"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Inbox, Search, Trash2, X } from "lucide-react";
import { cn, fmtDateFr, PIPELINE_COLORS } from "@/lib/utils";
import { attachTallyResponse, deleteTallyResponse } from "./actions";

export type PendingResponse = {
  id: string;
  form_name: string | null;
  received_at: string;
  guess_denomination: string | null;
  guess_email: string | null;
  guess_siren: string | null;
  payload: { data: { fields: Array<{ label: string; value: unknown }> } };
};

export type ClientOption = {
  id: string;
  denomination: string;
  siren: string | null;
  pipeline_statut: string | null;
};

export default function InboxList({
  responses,
  clients,
}: {
  responses: PendingResponse[];
  clients: ClientOption[];
}) {
  if (responses.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground bg-card">
        <Inbox className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
        Aucune réponse Tally en attente.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {responses.map((r) => (
        <ResponseCard key={r.id} response={r} clients={clients} />
      ))}
    </div>
  );
}

function ResponseCard({
  response,
  clients,
}: {
  response: PendingResponse;
  clients: ClientOption[];
}) {
  const [selected, setSelected] = useState<ClientOption | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Pré-suggestion : si on a un SIREN ou une dénomination qui matche, on présélectionne
  useEffect(() => {
    if (selected) return;
    const sirenGuess = response.guess_siren;
    const denomGuess = response.guess_denomination?.toLowerCase().trim();
    let match: ClientOption | undefined;
    if (sirenGuess) {
      match = clients.find((c) => c.siren === sirenGuess);
    }
    if (!match && denomGuess) {
      match = clients.find(
        (c) => c.denomination.toLowerCase().trim() === denomGuess
      );
    }
    if (match) setSelected(match);
  }, [clients, response.guess_siren, response.guess_denomination, selected]);

  function onAttach() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await attachTallyResponse(response.id, selected.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onDelete() {
    if (!confirm("Supprimer cette réponse Tally ?")) return;
    startTransition(async () => {
      try {
        await deleteTallyResponse(response.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3 transition-opacity",
        isPending && "opacity-60 pointer-events-none"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {response.form_name ?? "Formulaire Tally"}
          </div>
          <div className="text-xs text-muted-foreground">
            Reçu le {fmtDateFr(response.received_at)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {response.guess_denomination && (
              <div>
                <span className="text-muted-foreground">Société : </span>
                <span className="font-medium">{response.guess_denomination}</span>
              </div>
            )}
            {response.guess_email && (
              <div>
                <span className="text-muted-foreground">Email : </span>
                <span className="font-medium">{response.guess_email}</span>
              </div>
            )}
            {response.guess_siren && (
              <div>
                <span className="text-muted-foreground">SIREN : </span>
                <span className="font-medium tabular-nums">{response.guess_siren}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="text-zinc-400 hover:text-rose-600 transition-colors"
          title="Supprimer cette réponse"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-[hsl(var(--gold))] hover:underline"
      >
        {expanded ? "Masquer" : "Voir"} les {response.payload.data.fields.length} réponses
      </button>
      {expanded && (
        <div className="rounded-md bg-zinc-50 p-3 text-xs space-y-1 max-h-72 overflow-auto">
          {response.payload.data.fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr] gap-3">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="break-words">
                {Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? "—")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs text-zinc-700 font-medium">Rattacher à un dossier</div>
        <ClientCombobox
          clients={clients}
          selected={selected}
          onChange={setSelected}
        />
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onAttach}
            disabled={!selected || isPending}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--gold))] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isPending ? "Rattachement…" : "Rattacher au client"}
          </button>
          {selected && (
            <span className="text-xs text-zinc-500">
              Patch appliqué à <span className="font-medium text-zinc-700">{selected.denomination}</span>
            </span>
          )}
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Combobox de sélection de dossier client.
 * - Input texte avec recherche fuzzy (dénomination + SIREN)
 * - Dropdown flottant avec badges de pipeline
 * - Navigation clavier : ↑ ↓ Entrée Échap
 * - État sélectionné visible (chip + croix pour reset)
 */
function ClientCombobox({
  clients,
  selected,
  onChange,
}: {
  clients: ClientOption[];
  selected: ClientOption | null;
  onChange: (c: ClientOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter(
        (c) =>
          c.denomination.toLowerCase().includes(q) ||
          (c.siren ?? "").includes(q)
      )
      .slice(0, 50);
  }, [clients, query]);

  // Reset highlight quand la liste change
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  // Scroll vers l'élément highlight
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${highlightIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

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
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(c: ClientOption) {
    onChange(c);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[highlightIdx]) {
      e.preventDefault();
      pick(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  // Cas 1 : un client est sélectionné → affiche un chip propre
  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border-2 border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/5 px-3 py-2">
        <Check className="h-4 w-4 text-[hsl(var(--gold-dark))] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-900 truncate">
            {selected.denomination}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {selected.siren && (
              <span className="text-[11px] text-zinc-500 tabular-nums">
                SIREN {selected.siren}
              </span>
            )}
            {selected.pipeline_statut && (
              <span
                className={cn(
                  "inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border",
                  PIPELINE_COLORS[selected.pipeline_statut] ??
                    "bg-zinc-100 text-zinc-600 border-zinc-200"
                )}
              >
                {selected.pipeline_statut.replace(/^[0-9Z] - /, "")}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-white transition-colors"
          title="Changer de dossier"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Cas 2 : pas de sélection → combobox avec recherche
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Rechercher un dossier (dénomination ou SIREN)…"
          className="w-full pl-8 pr-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border bg-white shadow-xl overflow-hidden animate-slide-up-fade">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-sm text-zinc-500 text-center">
              Aucun dossier ne correspond à « {query} ».
            </div>
          ) : (
            <ul
              ref={listRef}
              className="max-h-72 overflow-auto py-1"
            >
              {filtered.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-idx={i}
                    onClick={() => pick(c)}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={cn(
                      "w-full text-left px-3 py-2 transition-colors flex items-center gap-2",
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
              sélectionner
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
