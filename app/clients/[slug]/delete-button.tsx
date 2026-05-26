"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteClient } from "./actions";

/**
 * Bouton de suppression d'un dossier client, avec modale de confirmation
 * custom (stylée comme le reste du CRM, pas le confirm() natif du browser).
 *
 * Sécurité : l'utilisateur doit retaper le nom du dossier exactement pour
 * activer le bouton "Supprimer". L'action est irréversible côté DB.
 */
export default function DeleteClientButton({
  clientId,
  denomination,
}: {
  clientId: string;
  denomination: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automatique sur l'input quand la modale s'ouvre
  useEffect(() => {
    if (open) {
      setTyped("");
      setError(null);
      // setTimeout pour laisser le DOM render avant focus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Échap ferme la modale
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isPending]);

  const matches = typed.trim() === denomination.trim();

  function onConfirm() {
    if (!matches) {
      setError("Le nom saisi ne correspond pas.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteClient(clientId);
        setOpen(false);
        router.push("/clients");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className={cn(
          "text-xs px-2.5 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-400 transition-colors",
          isPending && "opacity-60"
        )}
        title="Supprimer définitivement le dossier"
      >
        {isPending ? "Suppression…" : "Supprimer le dossier"}
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <ConfirmModal
            denomination={denomination}
            typed={typed}
            onTypedChange={setTyped}
            matches={matches}
            error={error}
            isPending={isPending}
            inputRef={inputRef}
            onClose={() => !isPending && setOpen(false)}
            onConfirm={onConfirm}
          />,
          document.body
        )}
    </>
  );
}

// ============================================================================
//  ConfirmModal
// ============================================================================

function ConfirmModal({
  denomination,
  typed,
  onTypedChange,
  matches,
  error,
  isPending,
  inputRef,
  onClose,
  onConfirm,
}: {
  denomination: string;
  typed: string;
  onTypedChange: (v: string) => void;
  matches: boolean;
  error: string | null;
  isPending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      {/* Overlay sombre */}
      <div
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-slide-up-fade">
        {/* Header rose : warning */}
        <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-start gap-3">
          <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-100">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="delete-modal-title"
              className="text-sm font-semibold text-zinc-900"
            >
              Supprimer le dossier ?
            </h3>
            <p className="text-xs text-zinc-600 mt-0.5">
              Cette action est <strong>irréversible</strong>. Toutes les données
              liées seront supprimées définitivement :
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="shrink-0 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <ul className="text-xs text-zinc-600 list-disc list-inside space-y-0.5 ml-1">
            <li>obligations &amp; échéances</li>
            <li>tâches d&apos;onboarding</li>
            <li>contacts rattachés</li>
            <li>commentaires</li>
          </ul>

          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2">
            <div className="text-[11px] text-zinc-500 mb-1">
              Pour confirmer, tape exactement le nom du dossier :
            </div>
            <div className="text-sm font-semibold text-zinc-900 mb-2 select-all">
              {denomination}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => onTypedChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches && !isPending) onConfirm();
              }}
              placeholder="Tape le nom ici…"
              disabled={isPending}
              className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 transition"
            />
            {error && (
              <div className="text-[11px] text-rose-600 mt-1.5">{error}</div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md text-sm text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || isPending}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              matches && !isPending
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-rose-200 text-rose-50 cursor-not-allowed"
            )}
          >
            {isPending ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>
  );
}
