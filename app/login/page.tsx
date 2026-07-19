"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "forgot";

// SSO Microsoft Entra activé côté app ? Piloté par une variable d'env publique
// (NEXT_PUBLIC_SSO_ENABLED="true"). Tant qu'elle n'est pas posée, la page reste
// EXACTEMENT en mode e-mail/mot de passe actuel → aucune régression. Le vrai
// branchement (Client ID/Secret/tenant) se configure côté Supabase + Azure.
const SSO_ENABLED = process.env.NEXT_PUBLIC_SSO_ENABLED === "true";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Accès de secours par mot de passe : caché en usage normal quand le SSO est
  // actif, révélé uniquement via l'URL ...?secours (anti-verrouillage total si
  // Microsoft tombe). Sans SSO, le formulaire reste le mode nominal.
  const [rescue, setRescue] = useState(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("secours")) setRescue(true);
    // Erreur remontée par /auth/callback (échange de code SSO échoué, domaine
    // refusé par le trigger DB, etc.).
    if (sp.get("error") === "auth_failed") {
      setError("Échec de la connexion. Un compte @moonexpertise.fr est requis.");
    }
  }, []);
  const showPassword = !SSO_ENABLED || rescue;

  async function onSSO() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid profile email",
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    // En cas de succès, supabase-js redirige le navigateur vers Microsoft :
    // on n'atteint ce point que si l'appel a échoué.
    if (error) {
      setLoading(false);
      setError("Impossible de lancer la connexion Microsoft. Réessaie.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    // Validation côté client : feedback immédiat. La sécurité réelle est
    // côté DB via le trigger handle_new_user() (impossible à contourner).
    if (mode === "signup" && !email.toLowerCase().endsWith("@moonexpertise.fr")) {
      setLoading(false);
      setError("Seuls les emails @moonexpertise.fr peuvent créer un compte.");
      return;
    }

    const supabase = createClient();
    if (mode === "forgot") {
      // Réinitialisation par e-mail (même dispositif que MoonViz). Le lien
      // signé passe par /auth/callback puis /reset-password. Message neutre
      // dans tous les cas : ne révèle pas si un compte existe (anti-énumération).
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      setLoading(false);
      setInfo(
        "Si un compte existe avec cet e-mail, un lien de réinitialisation vient d'être envoyé. Pense à vérifier les spams."
      );
      return;
    }
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(translateError(error.message));
      } else {
        // Full reload : router.replace peut avoir un délai sur la prise en
        // compte du cookie de session par le middleware. window.location
        // garantit que le prochain request a le bon cookie.
        window.location.href = "/";
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(translateError(error.message));
      } else {
        // Sécurité : le compte est créé en `approved = false`. Le middleware
        // côté serveur redirigera vers /en-attente jusqu'à approbation par
        // un admin (Benjamin).
        setInfo(
          "Compte créé. Un administrateur doit l'approuver avant que tu puisses accéder à l'app. Tu peux te connecter dès maintenant pour voir l'état."
        );
        setMode("signin");
        setPassword("");
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-zinc-50 via-white to-[hsl(var(--gold))]/[0.04] dark:from-[hsl(var(--background))] dark:via-[hsl(var(--surface-muted))] dark:to-[hsl(var(--gold))]/[0.08]">
      {/* Aurore spatiale (thème navy) — même ambiance que l'app connectée. */}
      <div aria-hidden className="navy-aurora pointer-events-none fixed inset-0 -z-10" />
      <div className="w-full max-w-sm space-y-8 animate-slide-up-fade">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/moon-icon.svg"
            alt="MOON Expertise"
            width={56}
            height={56}
            className="mx-auto mb-4 h-14 w-14 drop-shadow-lg animate-float"
          />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900">
            MoonCRM
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            {mode === "forgot"
              ? "Entre ton e-mail, on t'envoie un lien de réinitialisation."
              : mode === "signup"
              ? "Crée un compte pour accéder au CRM."
              : SSO_ENABLED && !rescue
              ? "Connecte-toi avec ton compte Microsoft MOON Expertise."
              : "Connecte-toi avec ton email et ton mot de passe."}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-6 space-y-4">
          {/* Bouton SSO Microsoft (mode connexion uniquement). */}
          {SSO_ENABLED && mode === "signin" && (
            <button
              type="button"
              onClick={onSSO}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 px-4 py-2.5 text-sm font-medium shadow-card hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:shadow-card-hover transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Se connecter avec Microsoft
            </button>
          )}

          {/* Séparateur "accès de secours" quand le SSO est actif ET que le
              formulaire mot de passe est révélé (?secours). */}
          {SSO_ENABLED && mode === "signin" && showPassword && (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-white/[0.10]" />
              <span className="text-xs text-zinc-400">accès de secours</span>
              <span className="h-px flex-1 bg-zinc-200 dark:bg-white/[0.10]" />
            </div>
          )}

          {/* Formulaire e-mail/mot de passe : masqué en mode SSO nominal. */}
          {(showPassword || mode === "forgot") && (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Adresse mail"
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 px-3 py-2.5 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all hover:border-zinc-300 dark:hover:border-white/[0.16] focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 focus:ring-4 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.10]"
            />
            {mode !== "forgot" && (
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signin" ? "Mot de passe" : "Choisir un mot de passe (6+ caractères)"}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 px-3 py-2.5 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all hover:border-zinc-300 dark:hover:border-white/[0.16] focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 focus:ring-4 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.10]"
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 py-2.5 text-sm font-medium shadow-card hover:bg-zinc-800 dark:hover:bg-white hover:shadow-card-hover transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading
                ? "…"
                : mode === "signin"
                ? "Se connecter"
                : mode === "signup"
                ? "Créer mon compte"
                : "Envoyer le lien"}
            </button>
            {mode === "signin" && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); setInfo(null); setPassword(""); }}
                  className="text-xs text-zinc-500 hover:text-[hsl(var(--gold-dark))] dark:hover:text-[hsl(var(--gold))] underline underline-offset-2 transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}
          </form>
          )}

          {/* Erreur / info : hors du formulaire pour rester visibles même en
              mode SSO (bouton masqué). */}
          {error && (
            <p className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {info && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg px-3 py-2">
              {info}
            </p>
          )}
        </div>

        {!(SSO_ENABLED && !rescue && mode === "signin") && (
        <div className="text-xs text-center text-zinc-500">
          {mode === "signin" ? (
            <>
              Pas encore de compte ?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                className="text-zinc-700 hover:text-[hsl(var(--gold-dark))] underline underline-offset-2 font-medium"
              >
                Créer un compte
              </button>
            </>
          ) : mode === "forgot" ? (
            <>
              Retrouvé ton mot de passe ?{" "}
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="text-zinc-700 hover:text-[hsl(var(--gold-dark))] underline underline-offset-2 font-medium"
              >
                Se connecter
              </button>
            </>
          ) : (
            <>
              Déjà un compte ?{" "}
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="text-zinc-700 hover:text-[hsl(var(--gold-dark))] underline underline-offset-2 font-medium"
              >
                Se connecter
              </button>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/**
 * Traduit les messages d'erreur Supabase en français lisible.
 * Les codes Supabase sont en anglais, peu user-friendly.
 */
function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed"))
    return "Email pas encore confirmé. Vérifie ta boîte mail.";
  if (m.includes("user already registered") || m.includes("already exists"))
    return "Un compte existe déjà avec cet email. Connecte-toi.";
  if (m.includes("rate limit"))
    return "Trop de tentatives. Attends quelques minutes.";
  if (m.includes("password should be at least"))
    return "Mot de passe trop court (6 caractères minimum).";
  if (m.includes("weak password"))
    return "Mot de passe trop faible. Mets-en un plus complexe.";
  // Erreur custom remontée par notre trigger DB handle_new_user()
  if (m.includes("@moonexpertise.fr"))
    return "Seuls les emails @moonexpertise.fr peuvent créer un compte.";
  return msg;
}
