import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import ActivitesManager from "./manager";
import type { TimeActivite } from "./actions";

export const dynamic = "force-dynamic";

export default async function TempsActivitesPage() {
  const sb = await createClient();
  const { data } = await sb
    .from("time_activites")
    .select("id, libelle, ordre, actif")
    .order("ordre");
  const items = (data ?? []) as TimeActivite[];

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Activités (saisie des temps)"
        description="Liste des activités proposées lors de la saisie des temps. Une activité masquée n'est plus proposée mais reste affichée sur les saisies déjà enregistrées."
        actions={
          <Link
            href="/parametrage"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-sm transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Paramétrage
          </Link>
        }
      />
      <ActivitesManager items={items} />
    </div>
  );
}
