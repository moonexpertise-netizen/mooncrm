"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Barre de progression de navigation (style Linear / GitHub / YouTube).
 *
 * Pourquoi : sans squelette de chargement (loading.tsx), Next.js garde
 * l'ancienne page affichée pendant qu'il charge la nouvelle côté serveur.
 * C'est fluide (pas de flash) MAIS il faut un retour visuel immédiat au clic
 * pour que ça ne paraisse pas figé. Cette barre file en haut dès le clic et se
 * termine quand la nouvelle route est montée.
 *
 * Mécanique :
 *   - START : on intercepte le clic sur un lien interne (phase capture, avant
 *     que Next ne prenne la main) -> la barre démarre instantanément.
 *   - FINISH : quand `pathname` change (= la nouvelle page est rendue), on
 *     complète la barre puis on la masque.
 *
 * 100% client, aucune dépendance externe. La couleur suit l'accent MOON (gold).
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  }

  function start() {
    clearTimers();
    setVisible(true);
    setWidth(8);
    // Progression qui ralentit en approchant 90% (on ne finit jamais seul :
    // le 100% vient de finish(), au montage de la nouvelle route).
    trickleRef.current = setInterval(() => {
      setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w));
    }, 180);
  }

  function finish() {
    clearTimers();
    setWidth(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 240);
  }

  // START : clic sur un lien interne.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      // Clic gauche seul (pas de nouvel onglet / sélection).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const a = anchor as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return; // liens internes uniquement
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      // Même URL (pathname + query) -> pas de navigation.
      const url = new URL(a.href, window.location.href);
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // FINISH : la route a changé -> la nouvelle page est montée.
  useEffect(() => {
    finish();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
        transition: "opacity 220ms ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "hsl(var(--gold))",
          boxShadow: "0 0 8px hsl(var(--gold) / 0.7), 0 0 2px hsl(var(--gold))",
          transition: "width 180ms ease",
        }}
      />
    </div>
  );
}
