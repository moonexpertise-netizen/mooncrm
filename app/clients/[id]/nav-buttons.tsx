"use client";

import Link from "next/link";

/**
 * Boutons prev/next "tab-aware" : lit le tab courant de l'URL via
 * window.location.search (mis à jour par FicheTabs via replaceState).
 * Construit les href au moment du clic via onMouseEnter (touch via hash).
 */
export default function NavButtons({
  prev,
  next,
  idx,
  total,
  filtered,
  navParams,
}: {
  prev: { id: string; denomination: string } | null;
  next: { id: string; denomination: string } | null;
  idx: number;
  total: number;
  filtered: boolean;
  navParams: string; // déjà sérialisé (nav-q=...&nav-pipeline=...)
}) {
  function buildHref(targetId: string): string {
    if (typeof window === "undefined") return `/clients/${targetId}${navParams ? `?${navParams}` : ""}`;
    const params = new URLSearchParams(window.location.search);
    // Garde seulement tab, year. Le reste de navParams (nav-*) est ajouté à côté.
    const out = new URLSearchParams();
    const tab = params.get("tab");
    const year = params.get("year");
    if (tab) out.set("tab", tab);
    if (year) out.set("year", year);
    // Append navParams
    if (navParams) {
      const navUrl = new URLSearchParams(navParams);
      navUrl.forEach((v, k) => out.set(k, v));
    }
    const qs = out.toString();
    return `/clients/${targetId}${qs ? `?${qs}` : ""}`;
  }

  // Pour `<Link>`, on a besoin du href dès le rendu. On utilise une approche
  // "lazy" : on attache l'event onClick qui calcule le href au dernier moment
  // et déclenche router.push.
  function onClick(e: React.MouseEvent<HTMLAnchorElement>, targetId: string) {
    e.preventDefault();
    const href = buildHref(targetId);
    // Hard navigation via window.location pour rester simple (force re-fetch
    // du serveur sur la nouvelle fiche, ce qu'on veut).
    window.location.href = href;
  }

  return (
    <div className="flex items-center gap-1">
      {prev ? (
        <Link
          href={`/clients/${prev.id}`}
          onClick={(e) => onClick(e, prev.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400 transition text-xs"
          title={`Précédent : ${prev.denomination}`}
        >
          ← <span className="truncate max-w-[160px]">{prev.denomination}</span>
        </Link>
      ) : (
        <span className="px-2.5 py-1 text-xs text-zinc-300">←</span>
      )}
      <span className="text-[11px] text-muted-foreground tabular-nums px-1">
        {idx >= 0 ? idx + 1 : "?"} / {total}
        {filtered && <span className="ml-1 text-[hsl(var(--gold))]">·filtré</span>}
      </span>
      {next ? (
        <Link
          href={`/clients/${next.id}`}
          onClick={(e) => onClick(e, next.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400 transition text-xs"
          title={`Suivant : ${next.denomination}`}
        >
          <span className="truncate max-w-[160px]">{next.denomination}</span> →
        </Link>
      ) : (
        <span className="px-2.5 py-1 text-xs text-zinc-300">→</span>
      )}
    </div>
  );
}
