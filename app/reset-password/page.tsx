"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Réinitialisation du mot de passe (même dispositif que MoonViz).
 *
 * Parcours :
 *   1. /login → « Mot de passe oublié ? » → resetPasswordForEmail (Supabase
 *      envoie un lien signé, via Resend si le SMTP custom est configuré).
 *   2. Le lien pointe vers /auth/callback?next=/reset-password : le callback
 *      échange le code contre une session de récupération puis arrive ici.
 *   3. L'utilisateur choisit un nouveau mot de passe → updateUser({ password }).
 *
 * Si la session de récupération est absente (lien expiré / déjà utilisé),
 * on l'explique et on renvoie vers /login.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Vérifie qu'on arrive bien avec une session (via le lien e-mail).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Mot de passe trop court (6 caractères minimum).");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("session") || m.includes("not logged in")) {
        setError("Lien expiré ou déjà utilisé. Redemande un e-mail de réinitialisation depuis la page de connexion.");
      } else if (m.includes("should be different")) {
        setError("Le nouveau mot de passe doit être différent de l'ancien.");
      } else {
        setError(error.message);
      }
      return;
    }
    setDone(true);
    // Full reload : garantit que le middleware voit le cookie de session à jour.
    setTimeout(() => { window.location.href = "/"; }, 1200);
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 px-3 py-2.5 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all hover:border-zinc-300 dark:hover:border-white/[0.16] focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 focus:ring-4 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.10]";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-zinc-50 via-white to-[hsl(var(--gold))]/[0.04] dark:from-[hsl(var(--background))] dark:via-[hsl(var(--surface-muted))] dark:to-[hsl(var(--gold))]/[0.08]">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/moon-icon.svg"
            alt="MOON Expertise"
            width={56}
            height={56}
            className="mx-auto mb-4 h-14 w-14 drop-shadow-lg"
          />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nouveau mot de passe
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            Choisis un nouveau mot de passe pour ton compte.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-6">
          {hasSession === false ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg px-3 py-2">
                Lien expiré ou invalide. Redemande un e-mail de réinitialisation.
              </p>
              <a
                href="/login"
                className="inline-block text-sm text-zinc-700 dark:text-zinc-300 hover:text-[hsl(var(--gold-dark))] dark:hover:text-[hsl(var(--gold))] underline underline-offset-2 font-medium"
              >
                Retour à la connexion
              </a>
            </div>
          ) : done ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg px-3 py-2 text-center">
              Mot de passe mis à jour. Redirection…
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nouveau mot de passe (6+ caractères)"
                className={inputClass}
                disabled={hasSession === null}
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirmer le mot de passe"
                className={inputClass}
                disabled={hasSession === null}
              />
              <button
                type="submit"
                disabled={loading || hasSession === null}
                className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 py-2.5 text-sm font-medium shadow-card hover:bg-zinc-800 dark:hover:bg-white hover:shadow-card-hover transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                {loading ? "…" : "Mettre à jour le mot de passe"}
              </button>
              {error && (
                <p className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
