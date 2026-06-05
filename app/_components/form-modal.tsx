"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/focus-trap";

/**
 * Modale generique pour les formulaires (creation / edition).
 * Pattern partage sur toute l'app pour eviter de recoder header + backdrop +
 * portal + Esc + click outside dans chaque ecran (auparavant 4 variantes
 * quasi-identiques dans IR / CAA / Mission exc).
 *
 * Usage minimal :
 *   <FormModal title="Modifier X" onClose={...} onSubmit={save} submitLabel="Enregistrer" submitDisabled={!nom}>
 *     <inputs body />
 *   </FormModal>
 *
 * Le composant rend dans un portal sur document.body, gere :
 *   - Backdrop semi-transparent + blur (clic = onClose)
 *   - Esc -> onClose
 *   - Animation slide-up-fade au mount
 *   - Footer avec boutons Annuler + Submit (custom via prop submitLabel)
 *   - Erreur affichee au bottom du body si error prop fournie
 *
 * Si on a besoin d'un footer custom (ex. bouton supprimer), passer
 * `footer` au lieu de submitLabel.
 */
export function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel = "Enregistrer",
  submitDisabled = false,
  isPending = false,
  error,
  size = "lg",
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Appele au clic sur "Enregistrer". Si omis et footer non fourni, pas de
   *  bouton submit. */
  onSubmit?: () => void;
  /** Label du bouton submit (defaut "Enregistrer"). */
  submitLabel?: string;
  /** Grise le bouton submit. */
  submitDisabled?: boolean;
  /** Spinner + disabled pendant l'action (label devient "Sauvegarde..."). */
  isPending?: boolean;
  /** Message d'erreur a afficher en bas du body. */
  error?: string | null;
  /** Taille de la modale (largeur max). */
  size?: "sm" | "md" | "lg" | "xl";
  /** Footer custom (remplace le defaut Annuler/Enregistrer). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // A11y : piege le Tab dans la modale + restaure le focus au close.
  useFocusTrap(dialogRef, true);

  // Esc -> close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-focus le 1er input/textarea/select au mount (UX : pas besoin de
  // cliquer pour commencer a taper).
  useEffect(() => {
    if (!dialogRef.current) return;
    const first = dialogRef.current.querySelector<HTMLElement>(
      "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled])"
    );
    first?.focus();
  }, []);

  if (typeof document === "undefined") return null;

  const sizeClass = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        className={cn(
          "relative w-full rounded-2xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade",
          sizeClass
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {children}
          {error && <div className="text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
          {footer ?? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              {onSubmit && (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={submitDisabled || isPending}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Sauvegarde…" : submitLabel}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
