"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Bouton retour intelligent de la fiche client.
 *
 * Lit en priorite `?from=` dans l'URL courante (inject par les listes
 * amont avec leurs filtres + tri encodes), sinon fallback sur
 * defaultHref/defaultLabel calcules cote serveur depuis le Referer.
 *
 * Ainsi : si Benjamin vient de
 *   /onboarding?status=in_progress&sort=pct
 * et clique un dossier, la fleche retour le ramene a cette URL EXACTE
 * (filtres + tri conserves), avec le label "Onboarding".
 */

const PATH_LABELS: Array<{ test: (p: string) => boolean; label: string }> = [
  { test: (p) => p === "/" || p.startsWith("/?"), label: "Dashboard" },
  { test: (p) => p === "/clients" || p.startsWith("/clients?"), label: "Clients" },
  { test: (p) => p.startsWith("/onboarding/matrice"), label: "Matrice onboarding" },
  { test: (p) => p.startsWith("/onboarding/parametrage"), label: "Paramétrage onboarding" },
  { test: (p) => p === "/onboarding" || p.startsWith("/onboarding?") || p.startsWith("/onboarding/"), label: "Onboarding" },
  { test: (p) => p === "/pipeline" || p.startsWith("/pipeline?"), label: "Pipeline" },
  { test: (p) => p === "/parametrage" || p.startsWith("/parametrage?"), label: "Paramétrage" },
  { test: (p) => p === "/obligations" || p.startsWith("/obligations?"), label: "Production" },
  { test: (p) => p.startsWith("/obligations/"), label: "Production" },
  { test: (p) => p.startsWith("/missions/ir"), label: "IR" },
  { test: (p) => p.startsWith("/missions/caa"), label: "CAA" },
];

function labelFromPath(path: string): string {
  for (const entry of PATH_LABELS) {
    if (entry.test(path)) return entry.label;
  }
  return "Retour";
}

/**
 * Ajoute ?highlight=<slug> a un href (en preservant les autres query params).
 * Le slug est utilise par la liste cible pour scroller + surligner la ligne
 * d'ou venait Benjamin.
 */
function withHighlight(href: string, slug: string): string {
  try {
    const u = new URL(href, "http://x/");
    u.searchParams.set("highlight", slug);
    return u.pathname + (u.search ?? "");
  } catch {
    // Fallback : concat manuel si parsing rate
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}highlight=${encodeURIComponent(slug)}`;
  }
}

export default function BackButton({
  defaultHref,
  defaultLabel,
  currentSlug,
}: {
  defaultHref: string;
  defaultLabel: string;
  /** Slug de la fiche courante - pour highlight la ligne au retour. */
  currentSlug: string;
}) {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");

  let href = defaultHref;
  let label = defaultLabel;
  if (fromParam) {
    try {
      const decoded = decodeURIComponent(fromParam);
      if (decoded.startsWith("/")) {
        href = decoded;
        // Extraire juste le pathname pour le label (sans search)
        const justPath = decoded.split("?")[0] ?? decoded;
        label = labelFromPath(justPath);
      }
    } catch {
      // ignore decode error, fallback aux defaults
    }
  }

  // Toujours injecter ?highlight= : meme sur le fallback /clients, la
  // liste va scroller vers la ligne du dossier qu'on quitte.
  const hrefWithHighlight = withHighlight(href, currentSlug);

  return (
    <Link
      href={hrefWithHighlight}
      aria-label={`Retour à ${label}`}
      className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
    >
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] group-hover:border-zinc-300 dark:group-hover:border-white/[0.20] group-hover:shadow-card transition-all">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
