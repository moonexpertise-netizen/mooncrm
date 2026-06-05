/**
 * useFocusTrap : piege le focus a l'interieur d'un container (modale) tant
 * qu'il est monte, puis restaure le focus a l'element qui l'avait avant
 * l'ouverture.
 *
 * A11y : sans ca, Tab dans une modale peut sortir vers le contenu derriere
 * (techniquement masque par le backdrop mais toujours focusable), et a la
 * fermeture l'utilisateur clavier perd le contexte (focus sur body).
 *
 * Usage :
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, isOpen);
 *   return <div ref={ref}>...</div>;
 *
 * Comportement :
 *   - Au mount/open : memorise document.activeElement
 *   - Tab depuis le dernier focusable -> 1er focusable du container
 *   - Shift+Tab depuis le 1er focusable -> dernier focusable
 *   - Au unmount/close : restaure le focus a l'element memorise (si encore
 *     dans le DOM, sinon noop)
 *
 * NB : le auto-focus du 1er input est gere separement par chaque modale
 * (logique metier : confirmation vs form vs alert ont des cibles differentes).
 */
import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    // Filtre les elements caches (display:none, visibility:hidden) qui
    // matchent le selector mais ne sont pas vraiment focusables.
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean = true
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Sauvegarde le focus actuel pour le restaurer a la fermeture.
    const previousFocus = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (!container) return;
      const focusables = getFocusable(container);
      if (focusables.length === 0) {
        // Aucun focusable -> garde le focus sur le container lui-meme
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restauration : ne tente que si l'element est encore dans le DOM
      // et focusable (sinon ca echoue silencieusement, mais autant verifier
      // pour eviter un focus errant sur body apres unmount).
      if (previousFocus && document.body.contains(previousFocus)) {
        try {
          previousFocus.focus();
        } catch {
          // Ignore : ex. element devenu disabled entre temps
        }
      }
    };
  }, [containerRef, active]);
}
