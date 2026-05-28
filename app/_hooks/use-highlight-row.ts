"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Hook a poser en haut d'une liste / table pour :
 *   1. Lire ?highlight=<id> dans l'URL au mount
 *   2. Trouver l'element DOM via document.getElementById(`<prefix>-<id>`)
 *   3. Scroll-into-view doux (centre du viewport)
 *   4. Animer un highlight visuel temporaire (~2s)
 *   5. Nettoyer ?highlight= de l'URL pour eviter qu'un F5 reanimme
 *
 * Usage :
 *   useHighlightRow("client");
 *   // puis sur chaque <tr> ou <Link> :
 *   <tr id={`client-${r.slug}`}>...</tr>
 *
 * Le highlight CSS utilise une class "row-highlight" qui doit etre definie
 * dans globals.css (deja fait : keyframes flash-amber + scroll-margin).
 */
export function useHighlightRow(prefix: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const id = searchParams.get("highlight");
    if (!id) return;

    // Petit delay pour laisser le tableau se rendre completement
    const t = setTimeout(() => {
      const el = document.getElementById(`${prefix}-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Highlight animee : ajoute une class qui declenche la keyframe.
        // On la retire apres 2.4s pour ne pas accumuler les classes.
        el.classList.add("row-highlight");
        setTimeout(() => el.classList.remove("row-highlight"), 2400);
      }

      // Nettoie ?highlight= de l'URL (history.replace, pas de push) pour
      // que F5 ne reanime pas, et que le bouton retour navigateur ne
      // re-highlight pas.
      const params = new URLSearchParams(searchParams);
      params.delete("highlight");
      const qs = params.toString();
      const newUrl = `${pathname}${qs ? `?${qs}` : ""}`;
      router.replace(newUrl, { scroll: false });
    }, 80);

    return () => clearTimeout(t);
    // On veut UNIQUEMENT au mount initial. Pas dans les deps : sinon le
    // hook se re-trigger apres le replace().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
