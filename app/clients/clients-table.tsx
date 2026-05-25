"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";

const DEFAULT_PIPELINE = ["7 - LDM signée", "Z - Interne"];

export type ClientRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  forme: string | null;
  activite: string | null;
  regime: string | null;
  pipeline_statut: string | null;
  arr: number;                 // calculé serveur · (compta + pilotage) * 12 + jur
  honoraires_compta: number;
  groupe_nom: string | null;
};

type SortKey = "denomination" | "groupe_nom" | "activite" | "pipeline_statut" | "arr";

export default function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Lecture initiale depuis l'URL. Si aucun param et pas de sentinel `clear`,
  // on applique le filtre par défaut métier "Signé + Interne" sur le pipeline.
  const isClearedByUser = searchParams.has("clear");
  const hasUrlFilter =
    searchParams.has("q") ||
    searchParams.has("pipeline") ||
    searchParams.has("forme");

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [pipelineFilter, setPipelineFilter] = useState<Set<string>>(() => {
    const v = searchParams.get("pipeline");
    if (v != null) return new Set(v ? v.split("|") : []);
    if (isClearedByUser || hasUrlFilter) return new Set();
    return new Set(DEFAULT_PIPELINE);
  });
  const [formeFilter, setFormeFilter] = useState<Set<string>>(() => {
    const v = searchParams.get("forme");
    return new Set(v ? v.split("|") : []);
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "denomination",
    dir: "asc",
  });

  // Synchronise les filtres en URL (pour persistance + partage du lien)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (pipelineFilter.size) params.set("pipeline", [...pipelineFilter].join("|"));
    if (formeFilter.size) params.set("forme", [...formeFilter].join("|"));
    // Sentinel : marque que l'utilisateur a touché aux filtres, même s'ils
    // sont tous vides. Sinon prochain reload réapplique le défaut.
    if (!pipelineFilter.size && !formeFilter.size && !search) {
      params.set("clear", "1");
    }
    const qs = params.toString();
    router.replace(`/clients${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, pipelineFilter, formeFilter, router]);

  useEffect(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(writeParams, 200);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [writeParams]);

  // Ctrl/Cmd + Shift + L = défiltre tout (style Excel)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setSearch("");
        setPipelineFilter(new Set());
        setFormeFilter(new Set());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  // Listes uniques pour les filtres
  const pipelines = useMemo(
    () => unique(rows.map((r) => r.pipeline_statut).filter(Boolean) as string[]),
    [rows]
  );
  const formes = useMemo(
    () => unique(rows.map((r) => r.forme).filter(Boolean) as string[]),
    [rows]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""} ${r.groupe_nom ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (pipelineFilter.size && !pipelineFilter.has(r.pipeline_statut ?? "")) return false;
      if (formeFilter.size && !formeFilter.has(r.forme ?? "")) return false;
      return true;
    });
  }, [rows, search, pipelineFilter, formeFilter]);

  const hasActiveFilter =
    search !== "" || pipelineFilter.size > 0 || formeFilter.size > 0;

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sort.key === "arr" ? a.arr : a[sort.key as keyof ClientRow];
      const vb = sort.key === "arr" ? b.arr : b[sort.key as keyof ClientRow];
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      const sa = (va ?? "").toString();
      const sb = (vb ?? "").toString();
      return sort.dir === "asc" ? sa.localeCompare(sb, "fr") : sb.localeCompare(sa, "fr");
    });
    return arr;
  }, [filtered, sort]);

  const totalArr = sorted.reduce((s, r) => s + (r.arr ?? 0), 0);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Rechercher (dénomination, siren, groupe...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[260px] px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 transition"
        />
        <MultiSelect
          label="Pipeline"
          values={pipelineFilter}
          onChange={setPipelineFilter}
          options={pipelines}
          colorMap={PIPELINE_COLORS}
        />
        <MultiSelect
          label="Forme"
          values={formeFilter}
          onChange={setFormeFilter}
          options={formes}
        />
        {hasActiveFilter && (
          <button
            onClick={() => {
              setSearch("");
              setPipelineFilter(new Set());
              setFormeFilter(new Set());
            }}
            className="px-3 py-2 rounded-md text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {hasActiveFilter && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Filtres actifs :</span>
          {[...pipelineFilter].map((v) => (
            <FilterChip key={`p-${v}`} label={v} color={PIPELINE_COLORS[v]} onRemove={() => {
              setPipelineFilter((prev) => { const next = new Set(prev); next.delete(v); return next; });
            }} />
          ))}
          {[...formeFilter].map((v) => (
            <FilterChip key={`f-${v}`} label={v} onRemove={() => {
              setFormeFilter((prev) => { const next = new Set(prev); next.delete(v); return next; });
            }} />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground flex justify-between">
        <div>
          {sorted.length} client{sorted.length > 1 ? "s" : ""} sur {rows.length}
        </div>
        <div>ARR cumulé : <span className="font-medium text-zinc-900 tabular-nums">{fmtEuro(totalArr)}</span></div>
      </div>

      {/* Desktop : table classique */}
      <div className="hidden md:block rounded-lg border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-700 text-xs uppercase tracking-wide">
            <tr>
              <Th label="Client" sortKey="denomination" sort={sort} onSort={toggleSort} />
              <Th label="Groupe" sortKey="groupe_nom" sort={sort} onSort={toggleSort} />
              <Th label="Activité" sortKey="activite" sort={sort} onSort={toggleSort} />
              <Th label="Pipeline" sortKey="pipeline_statut" sort={sort} onSort={toggleSort} />
              <Th label="ARR" sortKey="arr" sort={sort} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const navParams = new URLSearchParams();
              if (search) navParams.set("nav-q", search);
              if (pipelineFilter.size) navParams.set("nav-pipeline", [...pipelineFilter].join("|"));
              if (formeFilter.size) navParams.set("nav-forme", [...formeFilter].join("|"));
              const qs = navParams.toString();
              const href = `/clients/${r.slug}${qs ? `?${qs}` : ""}`;
              return (
              <tr
                key={r.id}
                className="border-t hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <td className="px-3 py-2">
                  <div className="font-medium flex items-center gap-1.5 flex-wrap">
                    <Link href={href} className="hover:underline">
                      {r.denomination}
                    </Link>
                    <PappersInpiBadges siren={r.siren} />
                  </div>
                  {r.siren && (
                    <Link href={href} className="block text-xs text-muted-foreground tabular-nums hover:underline">
                      {r.siren}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  <Link href={href} className="block">
                    {r.groupe_nom ?? <span className="text-zinc-300">·</span>}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  <Link href={href} className="block">
                    {r.activite ?? <span className="text-zinc-300">·</span>}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={href} className="block">
                    {r.pipeline_statut ? (
                      <Badge text={r.pipeline_statut} color={PIPELINE_COLORS[r.pipeline_statut]} />
                    ) : (
                      <span className="text-zinc-300">·</span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link href={href} className="block font-medium">
                    {fmtEuro(r.arr ?? 0)}
                  </Link>
                </td>
              </tr>
            );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Aucun client ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile : liste de cartes empilées (touch friendly) */}
      <div className="md:hidden space-y-2">
        {sorted.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun client ne correspond aux filtres.
          </div>
        ) : (
          sorted.map((r) => {
            const navParams = new URLSearchParams();
            if (search) navParams.set("nav-q", search);
            if (pipelineFilter.size) navParams.set("nav-pipeline", [...pipelineFilter].join("|"));
            if (formeFilter.size) navParams.set("nav-forme", [...formeFilter].join("|"));
            const qs = navParams.toString();
            const href = `/clients/${r.slug}${qs ? `?${qs}` : ""}`;
            return (
              <Link
                key={r.id}
                href={href}
                className="block rounded-lg border bg-card px-3 py-3 active:bg-zinc-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm truncate">{r.denomination}</span>
                      <PappersInpiBadges siren={r.siren} size="xs" />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                      {r.siren && <span className="tabular-nums">{r.siren}</span>}
                      {r.groupe_nom && <span>· {r.groupe_nom}</span>}
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums shrink-0">
                    {fmtEuro(r.arr ?? 0)}
                  </div>
                </div>
                {r.pipeline_statut && (
                  <div className="mt-2">
                    <Badge text={r.pipeline_statut} color={PIPELINE_COLORS[r.pipeline_statut]} />
                  </div>
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b, "fr"));
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium select-none",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-zinc-900 transition-colors",
          active ? "text-zinc-900" : "text-zinc-700"
        )}
      >
        {label}
        <span className="text-[10px] w-2">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function MultiSelect({
  label,
  values,
  onChange,
  options,
  colorMap,
}: {
  label: string;
  values: Set<string>;
  onChange: (v: Set<string>) => void;
  options: string[];
  colorMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(v: string) {
    const next = new Set(values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  }

  const count = values.size;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "px-3 py-2 rounded-md border bg-white text-sm transition-colors flex items-center gap-2",
          count > 0
            ? "border-zinc-400 text-zinc-900"
            : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
        )}
      >
        {label}
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[hsl(var(--gold))] text-white text-[10px] font-medium">
            {count}
          </span>
        )}
        <span className={cn("text-zinc-400 transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 bg-white border rounded-lg shadow-xl min-w-[220px] max-h-[300px] overflow-auto py-1 animate-slide-up-fade">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400">Aucune valeur.</div>
          )}
          {options.map((o) => {
            const active = values.has(o);
            return (
              <button
                key={o}
                onClick={() => toggle(o)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 flex items-center gap-2 transition-colors"
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                    active ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300 bg-white"
                  )}
                >
                  {active && <span className="text-[9px]">✓</span>}
                </span>
                {colorMap?.[o] ? (
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] border", colorMap[o])}>
                    {o}
                  </span>
                ) : (
                  <span>{o}</span>
                )}
              </button>
            );
          })}
          {count > 0 && (
            <div className="border-t mt-1 pt-1">
              <button
                onClick={() => onChange(new Set())}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100"
              >
                Tout désélectionner
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  color,
  onRemove,
}: {
  label: string;
  color?: string;
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border",
        color ?? "bg-zinc-100 text-zinc-700 border-zinc-200"
      )}
    >
      {label}
      <button
        onClick={onRemove}
        className="text-zinc-500 hover:text-zinc-900 transition-colors"
        title="Retirer"
      >
        ×
      </button>
    </span>
  );
}

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-medium border",
        color ?? "bg-zinc-100 text-zinc-700 border-zinc-200"
      )}
    >
      {text}
    </span>
  );
}
