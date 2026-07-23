"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Barre de progression de navigation (style Linear / GitHub / YouTube).
 *
 * Pourquoi : sans squelette de chargement (loading.tsx), Next.js garde
 * l'ancienne page affichée pendant qu'il charge la nouvelle côté serveur.
 * C'est fluide (pas de flash) MAIS il faut un retour visuel immédiat au clic
 * pour que ça ne paraisse pas figé.
 *
 * Mécanique :
 *   - START : on intercepte le clic sur un lien interne (phase capture, avant
 *     que Next ne prenne la main) -> la barre démarre instantanément.
 *   - FINISH : quand l'URL COMPLÈTE change (pathname *ou* query), la nouvelle
 *     page est rendue -> on complète la barre.
 *
 * Le suivi de la query est indispensable : sélecteur d'année, filtres et
 * onglets ne changent QUE la query. En ne surveillant que `pathname`, la barre
 * ne se terminait jamais sur ces navigations et restait plantée à 90 % —
 * c'est ce qui donnait l'impression d'un chargement interminable.
 */
export function NavigationProgress() {
  // useSearchParams impose une frontière Suspense : on l'encapsule ici pour
  // que les pages appelantes n'aient rien à faire.
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams?.toString() ?? ""}`;

  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
    if (failsafeRef.current) {
      clearTimeout(failsafeRef.current);
      failsafeRef.current = null;
    }
  }

  function start() {
    clearTimers();
    setVisible(true);
    // Départ franc : l'utilisateur doit voir la barre bouger tout de suite.
    setWidth(25);
    trickleRef.current = setInterval(() => {
      setWidth((w) => (w < 92 ? w + (92 - w) * 0.22 : w));
    }, 90);
    // Filet de sécurité : si une navigation est annulée (lien vers la même
    // page, erreur), la barre ne doit pas rester affichée indéfiniment.
    failsafeRef.current = setTimeout(() => finish(), 10000);
  }

  function finish() {
    clearTimers();
    setWidth(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 140);
  }

  // START : clic sur un lien interne.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const a = anchor as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return; // liens internes uniquement
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const next = new URL(a.href, window.location.href);
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      ) {
        return; // même URL : aucune navigation
      }
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // FINISH : l'URL complète a changé -> la nouvelle page est montée.
  useEffect(() => {
    finish();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2.5,
        zIndex: 100,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 140ms ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "hsl(var(--gold))",
          boxShadow: "0 0 8px hsl(var(--gold) / 0.7), 0 0 2px hsl(var(--gold))",
          transition: "width 110ms ease-out",
        }}
      />
    </div>
  );
}
