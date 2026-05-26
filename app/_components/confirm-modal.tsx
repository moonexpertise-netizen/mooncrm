"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modale de confirmation custom, alternative au confirm() natif du browser.
 *
 * Deux modes :
 *   - simple : un bouton Annuler / Confirmer
 *   - typeToConfirm : l'utilisateur doit retaper une chaîne exacte pour
 *     activer le bouton "Confirmer" (pour les actions destructives type
 *     suppression de dossier)
 *
 * Esc / clic hors modale = annuler (sauf pendant l'exécution).
 * Enter = confirmer (si actif).
 * Anim slide-up-fade pour l'entrée (cohérent avec les autres popovers).
 */

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Variant visuel. "danger" = rouge (suppression, désactivation massive). */
  variant?: "default" | "danger";
  /** Si défini, l'utilisateur doit retaper exactement cette chaîne. */
  typeToConfirm?: string;
};

type State = ConfirmOptions & {
  open: boolean;
  resolve: (ok: boolean) => void;
};

/**
 * Hook : retourne une fonction `confirm(opts)` qui résout `true` si l'utilisateur
 * a confirmé, `false` sinon. À utiliser à la place du confirm() natif.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Supprimer ?", variant: "danger" })) {
 *     await serverAction();
 *   }
 */
export function useConfirm() {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ ...opts, open: true, resolve });
      });
    },
    []
  );

  function handleResult(ok: boolean) {
    if (state) {
      state.resolve(ok);
      setState(null);
    }
  }

  const node =
    state && typeof document !== "undefined"
      ? createPortal(
          <ConfirmModalRender
            options={state}
            onCancel={() => handleResult(false)}
            onConfirm={() => handleResult(true)}
          />,
          document.body
        )
      : null;

  return { confirm, ConfirmDialog: node };
}

// ============================================================================
//  Rendu interne
// ============================================================================

function ConfirmModalRender({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const {
    title,
    description,
    confirmLabel = "Confirmer",
    cancelLabel = "Annuler",
    variant = "default",
    typeToConfirm,
  } = options;

  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automatique : input si typeToConfirm, sinon bouton Confirmer
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Esc = annuler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const matches = typeToConfirm ? typed.trim() === typeToConfirm.trim() : true;
  const isDanger = variant === "danger";

  const Icon = isDanger ? AlertTriangle : Info;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md"
        onClick={onCancel}
        aria-hidden
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-modal border border-zinc-200/70 overflow-hidden animate-slide-up-fade">
        {/* Header */}
        <div
          className={cn(
            "px-5 py-4 border-b flex items-start gap-3",
            isDanger
              ? "bg-rose-50 border-rose-200"
              : "bg-zinc-50 border-zinc-200"
          )}
        >
          <div
            className={cn(
              "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full",
              isDanger ? "bg-rose-100" : "bg-zinc-200"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                isDanger ? "text-rose-600" : "text-zinc-600"
              )}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="confirm-modal-title"
              className="text-sm font-semibold text-zinc-900"
            >
              {title}
            </h3>
            {description && (
              <div className="text-xs text-zinc-600 mt-0.5">{description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body : type-to-confirm */}
        {typeToConfirm && (
          <div className="px-5 py-4">
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2">
              <div className="text-[11px] text-zinc-500 mb-1">
                Pour confirmer, tape exactement :
              </div>
              <div className="text-sm font-semibold text-zinc-900 mb-2 select-all">
                {typeToConfirm}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches) onConfirm();
                }}
                placeholder="Tape ici…"
                className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 transition"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm text-zinc-700 hover:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={typeToConfirm ? undefined : (el) => el?.focus()}
            onClick={onConfirm}
            disabled={!matches}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              isDanger
                ? matches
                  ? "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400"
                  : "bg-rose-200 text-rose-50 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:ring-zinc-400"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modale d'alerte simple (remplacement de window.alert).
 * Pas de Annuler, juste un bouton OK pour fermer.
 */
export function useAlert() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description?: React.ReactNode;
    resolve: () => void;
  } | null>(null);

  const alert = useCallback(
    (opts: { title: string; description?: React.ReactNode }): Promise<void> => {
      return new Promise((resolve) => {
        setState({ ...opts, open: true, resolve });
      });
    },
    []
  );

  function handleClose() {
    if (state) {
      state.resolve();
      setState(null);
    }
  }

  const node =
    state && typeof document !== "undefined"
      ? createPortal(
          <AlertModalRender
            title={state.title}
            description={state.description}
            onClose={handleClose}
          />,
          document.body
        )
      : null;

  return { alert, AlertDialog: node };
}

function AlertModalRender({
  title,
  description,
  onClose,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-modal border border-zinc-200/70 overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b bg-zinc-50 border-zinc-200">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {description && (
            <div className="text-xs text-zinc-600 mt-1">{description}</div>
          )}
        </div>
        <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            ref={(el) => el?.focus()}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
