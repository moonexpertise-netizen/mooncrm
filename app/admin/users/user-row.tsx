"use client";

import { useState, useTransition } from "react";
import { approveUser, revokeUser, setRole } from "./actions";
import { toastError } from "@/lib/toast-helpers";
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, resolveRole, type Role } from "@/lib/permissions";

type Profile = {
  id: string;
  email: string;
  approved: boolean;
  is_admin: boolean;
  role: string | null;
  created_at: string;
  approved_at: string | null;
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] border-[hsl(var(--gold))]/40",
  collaborateur: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  lecture: "bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/[0.12]",
  externe: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
};

export default function UserRow({ profile }: { profile: Profile }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"revoke" | null>(null);
  // Rôle pré-sélectionné pour l'approbation (défaut : Collaborateur).
  const [pendingRole, setPendingRole] = useState<Role>("collaborateur");

  const currentRole = resolveRole(profile);

  const createdFr = new Date(profile.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        toastError(e, "Action impossible");
      }
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{profile.email}</span>
          {profile.approved ? (
            <span
              className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${ROLE_BADGE[currentRole]}`}
              title={ROLE_DESCRIPTIONS[currentRole]}
            >
              {ROLE_LABELS[currentRole]}
            </span>
          ) : (
            <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium border bg-amber-100 text-amber-800 border-amber-300">
              En attente
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Créé le {createdFr}
          {profile.approved_at && (
            <>
              {", approuvé le "}
              {new Date(profile.approved_at).toLocaleDateString("fr-FR")}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {!profile.approved ? (
          <>
            <select
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value as Role)}
              aria-label={`Rôle à attribuer à ${profile.email}`}
              className="h-8 px-2 rounded-lg text-xs border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              disabled={isPending}
              onClick={() => run(() => approveUser(profile.id, pendingRole))}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              Approuver
            </button>
          </>
        ) : (
          <>
            {/* Changer le rôle d'un compte déjà approuvé */}
            <select
              value={currentRole}
              disabled={isPending}
              onChange={(e) => run(() => setRole(profile.id, e.target.value as Role))}
              aria-label={`Rôle de ${profile.email}`}
              className="h-8 px-2 rounded-lg text-xs border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {confirming === "revoke" ? (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-rose-700 dark:text-rose-400">Confirmer ?</span>
                <button
                  disabled={isPending}
                  onClick={() => {
                    setConfirming(null);
                    run(() => revokeUser(profile.id));
                  }}
                  className="h-8 px-2.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
                >
                  Oui
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06]"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                disabled={isPending}
                onClick={() => setConfirming("revoke")}
                className="h-8 px-2.5 rounded-lg text-xs border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50"
              >
                Révoquer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
