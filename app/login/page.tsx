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
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MoonCRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin"
              ? "Connecte-toi avec ton email et ton mot de passe."
              : "Crée un compte pour accéder au CRM."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="benjamin.perez@moonexpertise.fr"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signin" ? "Mot de passe" : "Choisir un mot de passe (6+ caractères)"}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "…"
              : mode === "signin"
              ? "Se connecter"
              : "Créer mon compte"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
        </form>

        <div className="text-xs text-center text-muted-foreground">
          {mode === "signin" ? (
            <>
              Pas encore de compte ?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                className="text-zinc-700 hover:text-[hsl(var(--gold))] underline underline-offset-2"
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
                className="text-zinc-700 hover:text-[hsl(var(--gold))] underline underline-offset-2"
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
