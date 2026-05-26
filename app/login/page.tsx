"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(230_35%_9%)] to-[hsl(226_45%_13%)] shadow-modal mb-4">
            <span className="font-display text-2xl font-semibold text-white italic">M</span>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900">
            MoonCRM
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            {mode === "signin"
              ? "Connecte-toi avec ton email et ton mot de passe."
              : "Crée un compte pour accéder au CRM."}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-6">
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Adresse mail"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm placeholder:text-zinc-400 transition-all hover:border-zinc-300 focus:outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/[0.07]"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signin" ? "Mot de passe" : "Choisir un mot de passe (6+ caractères)"}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm placeholder:text-zinc-400 transition-all hover:border-zinc-300 focus:outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/[0.07]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 text-white py-2.5 text-sm font-medium shadow-card hover:bg-zinc-800 hover:shadow-card-hover transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading
                ? "…"
                : mode === "signin"
                ? "Se connecter"
                : "Créer mon compte"}
            </button>
            {error && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                {info}
              </p>
            )}
          </form>
        </div>

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
