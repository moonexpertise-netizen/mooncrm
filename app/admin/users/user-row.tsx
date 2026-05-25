"use client";

import { useState, useTransition } from "react";
import { approveUser, revokeUser, setAdmin } from "./actions";

type Profile = {
  id: string;
  email: string;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
  approved_at: string | null;
};

export default function UserRow({ profile }: { profile: Profile }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"revoke" | null>(null);

  const createdFr = new Date(profile.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{profile.email}</span>
          {profile.is_admin && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40">
              ADMIN
            </span>
          )}
          {!profile.approved && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-100 text-amber-800 border-amber-300">
              En attente
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Créé le {createdFr}
          {profile.approved_at && (
            <>
              {" · Approuvé le "}
              {new Date(profile.approved_at).toLocaleDateString("fr-FR")}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!profile.approved ? (
          <button
            disabled={isPending}
            onClick={() => startTransition(() => approveUser(profile.id))}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            ✓ Approuver
          </button>
        ) : (
          <>
            {!profile.is_admin && (
              <button
                disabled={isPending}
                onClick={() => startTransition(() => setAdmin(profile.id, true))}
                className="px-2.5 py-1.5 rounded-md text-xs border border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                title="Donner les droits admin"
              >
                Promouvoir admin
              </button>
            )}
            {profile.is_admin && (
              <button
                disabled={isPending}
                onClick={() => startTransition(() => setAdmin(profile.id, false))}
                className="px-2.5 py-1.5 rounded-md text-xs border border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                title="Retirer les droits admin"
              >
                Retirer admin
              </button>
            )}
            {confirming === "revoke" ? (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-rose-700">Confirmer ?</span>
                <button
                  disabled={isPending}
                  onClick={() => {
                    setConfirming(null);
                    startTransition(() => revokeUser(profile.id));
                  }}
                  className="px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700"
                >
                  Oui
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-50"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                disabled={isPending}
                onClick={() => setConfirming("revoke")}
                className="px-2.5 py-1.5 rounded-md text-xs border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
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
