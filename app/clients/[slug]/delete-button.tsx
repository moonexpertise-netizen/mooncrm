"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { deleteClient } from "./actions";

export default function DeleteClientButton({
  clientId,
  denomination,
}: {
  clientId: string;
  denomination: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const confirm1 = confirm(
      `Supprimer définitivement "${denomination}" ?\n\nToutes les données liées (obligations, échéances, onboarding, contacts) seront supprimées. Cette action est irréversible.`
    );
    if (!confirm1) return;
    const typed = prompt(`Tape "${denomination}" pour confirmer.`);
    if (typed?.trim() !== denomination.trim()) {
      if (typed != null) alert("Confirmation incorrecte. Suppression annulée.");
      return;
    }
    startTransition(async () => {
      try {
        await deleteClient(clientId);
        router.push("/clients");
      } catch (e) {
        alert(`Erreur : ${(e as Error).message}`);
      }
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className={cn(
        "text-xs px-2.5 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-400 transition-colors",
        isPending && "opacity-60"
      )}
      title="Supprimer définitivement le dossier"
    >
      {isPending ? "Suppression…" : "Supprimer le dossier"}
    </button>
  );
}
