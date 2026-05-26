"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";

// 3 buckets métier qui groupent les pipeline_statut.
// Le bucket par défaut est "clients" (clients actifs).
const BUCKET_PIPELINES: Record<Bucket, string[]> = {
  all: [],
  prospects: [
    "1 - Tally à envoyer",
    "2 - Tally à compléter",
    "3 - PC à préparer",
    "4 - PC envoyée",
    "5 - PC acceptée",
    "6 - LDM envoyée",
  ],
  clients: ["7 - LDM signée", "Z - Interne", "Z - Sous-traitance"],
  perdus: ["Z - Prospect perdu", "Z - Résiliée"],
};

const BUCKET_LABEL: Record<Bucket, string> = {
  all: "Tous",
  prospects: "Prospects",
  clients: "Clients",
  perdus: "Perdus & résiliés",
};

type Bucket = "all" | "prospects" | "clients" | "perdus";

function isValidBucket(b: string | null): b is Bucket {
  return b === "all" || b === "prospects" || b === "clients" || b === "perdus";
}

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

type SortKey = "denomination" | "forme" | "groupe_nom" | "activite" | "pipeline_statut" | "arr";

/** Largeur (en px) personnalisée par colonne, persistée en localStorage. */
type ColumnWidths = Partial<Record<SortKey, number>>;
const WIDTHS_STORAGE_KEY = "moon.clients-table.column-widths";
const MIN_COLUMN_WIDTH = 60;

export default function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Lecture initiale depuis l'URL. Si aucun param et pas de sentinel `clear`,
  // on applique le bucket "clients" par défaut (clients actifs MOON).
  // L'utilisateur peut explicitement passer en "Tous" via le bouton (cf. clear).
  const isClearedByUser = searchParams.has("clear");
  const hasUrlFilter =
    searchParams.has("q") ||
    searchParams.has("bucket") ||
    searchParams.has("forme") ||
    searchParams.has("activite");

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [bucket, setBucket] = useState<Bucket>(() => {
    const v = searchParams.get("bucket");
    if (isValidBucket(v)) return v;
    if (isClearedByUser || hasUrlFilter) return "all";
    return "clients"; // défaut métier : clients actifs
  });
  const [formeFilter, setFormeFilter] = useState<Set<string>>(() => {
    const v = searchParams.get("forme");
    return new Set(v ? v.split("|") : []);
  });
  const [activiteFilter, setActiviteFilter] = useState<string>(
    () => searchParams.get("activite") ?? ""
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "denomination",
    dir: "asc",
  });

  // Largeurs personnalisées par colonne. Vide au début → la table est en
  // table-auto (auto-fit au contenu). Quand l'utilisateur drag un bord, on
  // mémorise la largeur de cette colonne (les autres restent auto-fit).
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({});

  // Lecture initiale depuis localStorage (1× au mount)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WIDTHS_STORAGE_KEY);
      if (stored) setColumnWidths(JSON.parse(stored));
    } catch {
      // ignore JSON malformé
    }
  }, []);

  const setColumnWidth = useCallback((key: SortKey, width: number) => {
    setColumnWidths((prev) => {
      const next: ColumnWidths = { ...prev, [key]: width };
      try {
        localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota plein
      }
      return next;
    });
  }, []);

  // Reset des largeurs : double-clic sur un handle remet la colonne en auto-fit.
  const resetColumnWidth = useCallback((key: SortKey) => {
    setColumnWidths((prev) => {
      const next: ColumnWidths = { ...prev };
      delete next[key];
      try {
        localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Synchronise les filtres en URL (pour persistance F5 + partage du lien).
  // Quand l'utilisateur navigue à /clients depuis la sidebar (sans params),
  // l'init applique le défaut "clients". Quand il F5 sur une vue filtrée,
  // les params préservés re-hydratent l'état.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (bucket !== "clients") params.set("bucket", bucket);
    if (formeFilter.size) params.set("forme", [...formeFilter].join("|"));
    if (activiteFilter) params.set("activite", activiteFilter);
    // Sentinel : marque que l'utilisateur a explicitement choisi "Tous"
    // sans autre filtre. Sinon le prochain reload réappliquerait "clients".
    if (bucket === "all" && !search && !formeFilter.size && !activiteFilter) {
      params.set("clear", "1");
    }
    const qs = params.toString();
    router.replace(`/clients${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, bucket, formeFilter, activiteFilter, router]);

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
        setBucket("all");
        setFormeFilter(new Set());
        setActiviteFilter("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Listes uniques pour les filtres
  const formes = useMemo(
    () => unique(rows.map((r) => r.forme).filter(Boolean) as string[]),
    [rows]
  );

  // Compteurs par bucket (pour afficher dans les boutons)
  const bucketCounts = useMemo(() => {
    const c = { all: rows.length, prospects: 0, clients: 0, perdus: 0 };
    const setProspects = new Set(BUCKET_PIPELINES.prospects);
    const setClients = new Set(BUCKET_PIPELINES.clients);
    const setPerdus = new Set(BUCKET_PIPELINES.perdus);
    for (const r of rows) {
      const p = r.pipeline_statut ?? "";
      if (setProspects.has(p)) c.prospects++;
      else if (setClients.has(p)) c.clients++;
      else if (setPerdus.has(p)) c.perdus++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const bucketSet =
      bucket === "all" ? null : new Set(BUCKET_PIPELINES[bucket]);
    const actLower = activiteFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""} ${r.groupe_nom ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (bucketSet && !bucketSet.has(r.pipeline_statut ?? "")) return false;
      if (formeFilter.size && !formeFilter.has(r.forme ?? "")) return false;
      if (actLower && (r.activite ?? "").toLowerCase() !== actLower) return false;
      return true;
    });
  }, [rows, search, bucket, formeFilter, activiteFilter]);

  const hasActiveFilter =
    search !== "" ||
    bucket !== "clients" ||
    formeFilter.size > 0 ||
    activiteFilter !== "";

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
      {/* Buckets métier : Prospects / Clients (défaut) / Perdus */}
      <div className="flex flex-wrap items-center gap-1.5">
        <BucketBtn label="Tous" active={bucket === "all"} count={bucketCounts.all} onClick={() => setBucket("all")} />
        <BucketBtn label="Prospects" active={bucket === "prospects"} count={bucketCounts.prospects} tone="amber" onClick={() => setBucket("prospects")} />
        <BucketBtn label="Clients" active={bucket === "clients"} count={bucketCounts.clients} tone="emerald" onClick={() => setBucket("clients")} />
        <BucketBtn label="Perdus & résiliés" active={bucket === "perdus"} count={bucketCounts.perdus} tone="rose" onClick={() => setBucket("perdus")} />
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Rechercher (dénomination, siren, groupe...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[260px] px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 transition"
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
              setBucket("all");
              setFormeFilter(new Set());
              setActiviteFilter("");
            }}
            className="px-3 py-2 rounded-md text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {(formeFilter.size > 0 || activiteFilter) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Filtres actifs :</span>
          {activiteFilter && (
            <FilterChip
              label={`Activité : ${activiteFilter}`}
              onRemove={() => setActiviteFilter("")}
            />
          )}
          {[...formeFilter].map((v) => (
            <FilterChip key={`f-${v}`} label={v} onRemove={() => {
              setFormeFilter((prev) => { const next = new Set(prev); next.delete(v); return next; });
            }} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-zinc-500">
        <div>
          <span className="font-medium text-zinc-700 tabular-nums">{sorted.length}</span> client{sorted.length > 1 ? "s" : ""} <span className="text-zinc-400">sur {rows.length}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-zinc-500">ARR cumulé</span>
          <span className="font-semibold text-zinc-900 tabular-nums">{fmtEuro(totalArr)}</span>
        </div>
      </div>

      {/* Desktop : table moderne (style Attio/Linear). Bordures très douces,
          header avec uppercase tracking-wide, hover row subtil, lignes plus
          aérées (py-3 au lieu de py-2). */}
      <div className="hidden md:block rounded-xl border border-zinc-200/80 bg-white shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/60 text-zinc-500 text-[11px] uppercase tracking-wider font-medium border-b border-zinc-200/60">
            <tr>
              <Th label="Client" sortKey="denomination" sort={sort} onSort={toggleSort}
                width={columnWidths.denomination} onResize={setColumnWidth} onResetWidth={resetColumnWidth} />
              <Th label="Forme" sortKey="forme" sort={sort} onSort={toggleSort}
                width={columnWidths.forme} onResize={setColumnWidth} onResetWidth={resetColumnWidth} />
              <Th label="Groupe" sortKey="groupe_nom" sort={sort} onSort={toggleSort}
                width={columnWidths.groupe_nom} onResize={setColumnWidth} onResetWidth={resetColumnWidth} />
              <Th label="Activité" sortKey="activite" sort={sort} onSort={toggleSort}
                width={columnWidths.activite} onResize={setColumnWidth} onResetWidth={resetColumnWidth} />
              <Th label="Pipeline" sortKey="pipeline_statut" sort={sort} onSort={toggleSort}
                width={columnWidths.pipeline_statut} onResize={setColumnWidth} onResetWidth={resetColumnWidth} />
              <Th label="ARR" sortKey="arr" sort={sort} onSort={toggleSort} align="right"
                width={columnWidths.arr} onResize={setColumnWidth} onResetWidth={resetColumnWidth} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const navParams = new URLSearchParams();
              if (search) navParams.set("nav-q", search);
              if (bucket !== "clients") navParams.set("nav-bucket", bucket);
              if (formeFilter.size) navParams.set("nav-forme", [...formeFilter].join("|"));
              if (activiteFilter) navParams.set("nav-activite", activiteFilter);
              const qs = navParams.toString();
              const href = `/clients/${r.slug}${qs ? `?${qs}` : ""}`;
              return (
              <tr
                key={r.id}
                className="border-t border-zinc-100 hover:bg-zinc-50/50 transition-colors cursor-pointer group/row"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900 flex items-center gap-1.5 flex-wrap">
                    <Link href={href} className="hover:underline">
                      {r.denomination}
                    </Link>
                    <PappersInpiBadges siren={r.siren} />
                  </div>
                  {r.siren && (
                    <Link href={href} className="block text-xs text-muted-foreground tabular-nums mt-0.5 hover:underline">
                      {r.siren}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  <Link href={href} className="block">
                    {r.forme ? (
                      <span className="inline-block px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 text-zinc-700 tabular-nums">
                        {r.forme}
                      </span>
                    ) : (
                      <span className="text-zinc-300">·</span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  <Link href={href} className="block">
                    {r.groupe_nom ?? <span className="text-zinc-300">·</span>}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  <Link href={href} className="block">
                    {r.activite ?? <span className="text-zinc-300">·</span>}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={href} className="block">
                    {r.pipeline_statut ? (
                      <Badge text={r.pipeline_statut} color={PIPELINE_COLORS[r.pipeline_statut]} />
                    ) : (
                      <span className="text-zinc-300">·</span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <Link href={href} className="block font-medium text-zinc-900">
                    {fmtEuro(r.arr ?? 0)}
                  </Link>
                </td>
              </tr>
            );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  <div className="space-y-2">
                    <div className="text-zinc-400">Aucun client ne correspond aux filtres.</div>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setBucket("all");
                        setFormeFilter(new Set());
                        setActiviteFilter("");
                      }}
                      className="text-xs text-zinc-600 hover:text-zinc-900 underline-offset-2 hover:underline"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile : liste de cartes empilées (touch friendly) */}
      <div className="md:hidden space-y-2">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-zinc-200/80 bg-white shadow-card p-6 text-center text-sm text-zinc-500">
            Aucun client ne correspond aux filtres.
          </div>
        ) : (
          sorted.map((r) => {
            const navParams = new URLSearchParams();
            if (search) navParams.set("nav-q", search);
            if (bucket !== "clients") navParams.set("nav-bucket", bucket);
            if (formeFilter.size) navParams.set("nav-forme", [...formeFilter].join("|"));
            if (activiteFilter) navParams.set("nav-activite", activiteFilter);
            const qs = navParams.toString();
            const href = `/clients/${r.slug}${qs ? `?${qs}` : ""}`;
            return (
              <Link
                key={r.id}
                href={href}
                className="block rounded-xl border border-zinc-200/80 bg-white shadow-card px-3 py-3 active:bg-zinc-50 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm truncate">{r.denomination}</span>
                      <PappersInpiBadges siren={r.siren} size="xs" />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                      {r.siren && <span className="tabular-nums">{r.siren}</span>}
                      {r.forme && <span>· {r.forme}</span>}
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
  width,
  onResize,
  onResetWidth,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  /** Largeur explicite (px) si l'utilisateur a redimensionné. Undefined = auto-fit. */
  width?: number;
  onResize?: (key: SortKey, width: number) => void;
  onResetWidth?: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const thRef = useRef<HTMLTableCellElement>(null);

  function startResize(e: React.MouseEvent | React.PointerEvent) {
    if (!onResize || !thRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = "clientX" in e ? e.clientX : 0;
    const startWidth = thRef.current.offsetWidth;
    // Pendant le drag, on désactive la sélection texte de la page (sinon
    // ça highlight les cellules) et on met le cursor en col-resize partout.
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
      onResize!(sortKey, newWidth);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <th
      ref={thRef}
      style={width ? { width: `${width}px` } : undefined}
      className={cn(
        "relative px-4 py-3 font-medium select-none group/th",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-zinc-700 transition-colors",
          active ? "text-zinc-800" : "text-zinc-500"
        )}
      >
        {label}
        <span className="text-[9px] w-2 opacity-70">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
      {/* Drag handle (bord droit). Double-clic = reset auto-fit.
          Visible discrètement au hover de la cellule, doré pendant le drag. */}
      {onResize && (
        <span
          onMouseDown={startResize}
          onDoubleClick={() => onResetWidth?.(sortKey)}
          className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize bg-transparent hover:bg-[hsl(var(--gold))]/40 active:bg-[hsl(var(--gold))] transition-colors group-hover/th:bg-zinc-200"
          title="Drag = redimensionner · Double-clic = auto-fit"
          aria-hidden
        />
      )}
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

function BucketBtn({
  label,
  active,
  count,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  tone?: "amber" | "emerald" | "rose";
  onClick: () => void;
}) {
  const palette = {
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-300",
    rose: "bg-rose-50 text-rose-800 border-rose-300",
  } as const;
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5",
        active && tone
          ? `${palette[tone]} shadow-sm`
          : active
          ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
          : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
      <span className={cn("tabular-nums text-[10px]", active ? "" : "text-zinc-400")}>
        {count}
      </span>
    </button>
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
