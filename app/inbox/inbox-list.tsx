"use client";

import { useState, useTransition } from "react";
import { Inbox, Trash2 } from "lucide-react";
import { cn, fmtDateFr } from "@/lib/utils";
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
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.denomination.toLowerCase().includes(s) ||
      (c.siren ?? "").includes(s)
    );
  }).slice(0, 50);

  function onAttach() {
    if (!selectedClient) return;
    setError(null);
    startTransition(async () => {
      try {
        await attachTallyResponse(response.id, selectedClient);
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
    <div className={cn("rounded-lg border bg-card p-4 space-y-3", isPending && "opacity-60")}>
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
        <input
          type="text"
          placeholder="Filtrer par dénomination ou SIREN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30"
        />
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30"
          size={Math.min(6, Math.max(3, filtered.length))}
        >
          <option value="">— choisir un client —</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.denomination}
              {c.siren ? ` · ${c.siren}` : ""}
              {c.pipeline_statut ? ` · ${c.pipeline_statut}` : ""}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={onAttach}
            disabled={!selectedClient || isPending}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--gold))] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isPending ? "Rattachement…" : "Rattacher au client"}
          </button>
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
