"use client";

import { useMemo, useState, useTransition } from "react";
import { Trash2, Filter, Sparkles, User as UserIcon } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { useConfirm } from "@/app/_components/confirm-modal";
import { clearClientAuditLog } from "./actions";

type AuditEntry = {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by_email: string | null;
  source: string;
  motif: string | null;
};

/** Categorie d'affichage des champs - pour les filtres pills en haut. */
type Category = "pipeline" | "honoraires" | "autres";

/** Label + categorie pour chaque champ trackable. */
const FIELD_META: Record<string, { label: string; category: Category; format: "money" | "raw" | "boolean" | "date" }> = {
  pipeline_statut: { label: "Pipeline", category: "pipeline", format: "raw" },
  honoraires_compta: { label: "Honoraires compta", category: "honoraires", format: "money" },
  forfait_bilan: { label: "Forfait bilan", category: "honoraires", format: "money" },
  honoraires_jur: { label: "Honoraires juridique", category: "honoraires", format: "money" },
  tdb_honos_periode: { label: "Honoraires pilotage", category: "honoraires", format: "money" },
  oss_honos_trimestre: { label: "Honoraires OSS", category: "honoraires", format: "money" },
  honoraires_creation: { label: "Honoraires création", category: "honoraires", format: "money" },
  honoraires_reprise: { label: "Honoraires reprise", category: "honoraires", format: "money" },
  type_honos_bilans: { label: "Type honos bilans", category: "honoraires", format: "raw" },
  type_honos_jur: { label: "Type honos juridique", category: "honoraires", format: "raw" },
  type_honos_creation: { label: "Type honos création", category: "honoraires", format: "raw" },
  type_honos_reprise: { label: "Type honos reprise", category: "honoraires", format: "raw" },
  mrr_conditionne: { label: "MRR conditionné", category: "autres", format: "boolean" },
  mois_signature: { label: "Mois signature", category: "autres", format: "date" },
  gestion_tns: { label: "Gestion TNS", category: "autres", format: "boolean" },
  denomination: { label: "Dénomination", category: "autres", format: "raw" },
};

function formatValue(raw: string | null, fmt: "money" | "raw" | "boolean" | "date"): string {
  if (raw === null || raw === "") return "—";
  if (fmt === "money") {
    const n = parseFloat(raw);
    return Number.isNaN(n) ? raw : fmtEuro(n);
  }
  if (fmt === "boolean") {
    if (raw === "true" || raw === "t") return "oui";
    if (raw === "false" || raw === "f") return "non";
    return raw;
  }
  if (fmt === "date") {
    // mois_signature = "YYYY-MM-DD" -> "MM/YYYY"
    const m = raw.match(/^(\d{4})-(\d{2})/);
    if (m) {
      const MOIS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
      return `${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}`;
    }
    return raw;
  }
  return raw;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function HistoriqueList({
  clientId,
  clientSlug,
  entries,
}: {
  clientId: string;
  clientSlug: string;
  entries: AuditEntry[];
}) {
  const canEdit = useCan("edit_clients");
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [isPending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  // Compteurs par categorie pour les chips
  const counts = useMemo(() => {
    const c = { all: entries.length, pipeline: 0, honoraires: 0, autres: 0 };
    for (const e of entries) {
      const meta = FIELD_META[e.field];
      if (!meta) continue;
      c[meta.category]++;
    }
    return c;
  }, [entries]);

  const visible = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => FIELD_META[e.field]?.category === filter);
  }, [entries, filter]);

  async function onClear() {
    if (!canEdit) return;
    const ok = await confirm({
      title: "Vider l'historique ?",
      description: `Toutes les entrées seront supprimées définitivement (${entries.length} ligne${entries.length > 1 ? "s" : ""}). Les modifications futures seront tracées normalement.`,
      variant: "danger",
      confirmLabel: "Vider",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await clearClientAuditLog(clientId, clientSlug);
      } catch (e) {
        toastError(e, "Echec du vidage de l'historique");
      }
    });
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}

      {/* Toolbar : filtres + bouton vider */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 mr-1" />
          <FilterChip label="Tous" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label="Pipeline" count={counts.pipeline} active={filter === "pipeline"} onClick={() => setFilter("pipeline")} accent="violet" />
          <FilterChip label="Honoraires" count={counts.honoraires} active={filter === "honoraires"} onClick={() => setFilter("honoraires")} accent="emerald" />
          <FilterChip label="Autres" count={counts.autres} active={filter === "autres"} onClick={() => setFilter("autres")} />
        </div>
        {entries.length > 0 && canEdit && (
          <button
            type="button"
            onClick={onClear}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Supprime définitivement toutes les entrées d'historique"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Vider l'historique
          </button>
        )}
      </div>

      {/* Timeline */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {entries.length === 0
            ? "Aucune modification enregistrée pour ce dossier."
            : "Aucune entrée pour ce filtre."}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] shadow-card divide-y divide-zinc-100 dark:divide-white/[0.05] overflow-hidden">
          {visible.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  Entry : une ligne d'historique
// ============================================================================

function Entry({ entry }: { entry: AuditEntry }) {
  const meta = FIELD_META[entry.field] ?? {
    label: entry.field,
    category: "autres" as Category,
    format: "raw" as const,
  };
  const oldFmt = formatValue(entry.old_value, meta.format);
  const newFmt = formatValue(entry.new_value, meta.format);
  const isJarvis = entry.source === "jarvis";
  const author = entry.changed_by_email ?? "système";
  // Email : 1ere partie avant @ pour l'affichage compact
  const authorShort = author.split("@")[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2 md:gap-4 px-4 py-3 hover:bg-zinc-50/60 dark:hover:bg-white/[0.03] transition-colors">
      {/* Col 1 : date */}
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
        {formatDate(entry.changed_at)}
      </div>
      {/* Col 2 : modif */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
            {meta.label}
          </span>
        </div>
        <div className="text-sm mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 line-through decoration-zinc-400/50">
            {oldFmt}
          </span>
          <span className="text-zinc-400 dark:text-zinc-500">→</span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-medium">
            {newFmt}
          </span>
        </div>
        {entry.motif && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 italic">
            Motif : {entry.motif}
          </div>
        )}
      </div>
      {/* Col 3 : auteur + source */}
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 shrink-0">
        {isJarvis ? (
          <Sparkles className="h-3 w-3 text-[hsl(var(--gold))]" />
        ) : (
          <UserIcon className="h-3 w-3" />
        )}
        <span className="truncate" title={author}>{authorShort}</span>
        <span
          className={cn(
            "px-1 py-0.5 rounded text-[9px] uppercase tracking-wide font-medium",
            isJarvis
              ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))]"
              : "bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400"
          )}
        >
          {entry.source}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
//  FilterChip
// ============================================================================

function FilterChip({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: "violet" | "emerald";
}) {
  const activeClass = accent === "violet"
    ? "bg-violet-50 text-violet-800 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30"
    : accent === "emerald"
    ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
    : "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-white/[0.10] dark:text-zinc-50 dark:border-white/20";

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5",
        active
          ? `${activeClass} shadow-sm`
          : "bg-white dark:bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] hover:text-zinc-900 dark:hover:text-zinc-100"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "" : "text-zinc-400 dark:text-zinc-500")}>{count}</span>
    </button>
  );
}
