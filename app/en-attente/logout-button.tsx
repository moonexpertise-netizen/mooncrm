"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.replace("/login");
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
