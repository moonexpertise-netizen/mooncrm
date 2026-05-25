"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  // Poll toutes les 5s : si l'admin a approuvé le compte entre-temps,
  // on redirige automatiquement vers / (l'user n'a pas à rafraîchir).
  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.approved === true) {
        // Full reload : le middleware refait le check et redirige vers /.
        // router.replace ne suffit pas car le RSC est caché 30s (staleTimes).
        window.location.href = "/";
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  async function onLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Full reload pour s'assurer que le cookie de session est bien purgé.
    window.location.href = "/login";
  }

  return (
    <button
      onClick={onLogout}
      className="text-sm px-4 py-2 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 transition-colors"
    >
      Se déconnecter
    </button>
  );
}
