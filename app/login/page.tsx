"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
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

    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(translateError(error.message));
      } else {
        // signInWithPassword pose le cookie de session côté client. On force un
        // hard refresh pour que le middleware côté serveur le reprenne.
        router.refresh();
        router.replace("/");
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(translateError(error.message));
      } else {
        // Si "Confirm email" est désactivé côté Supabase, la session est
        // créée immédiatement → on redirige. Sinon on demande à l'utilisateur
        // de vérifier sa boîte.
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.refresh();
          router.replace("/");
        } else {
          setInfo(
            "Compte créé. Vérifie tes mails pour confirmer ton adresse, puis connecte-toi."
          );
          setMode("signin");
        }
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
  return msg;
}
