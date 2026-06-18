import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import { isClientBillable } from "@/lib/billable";
import MesTemps from "./mes-temps";

export const dynamic = "force-dynamic";

/** Lundi (ISO) de la semaine contenant `dateIso`. Calcul en UTC (dates pures). */
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=dim .. 6=sam
  const diff = (day + 6) % 7; // nb de jours depuis lundi
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().substring(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().substring(0, 10);
}

export default async function TempsPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  const sp = await searchParams;
  const base =
    sp.semaine && /^\d{4}-\d{2}-\d{2}$/.test(sp.semaine) ? sp.semaine : todayIso();
  const weekStart = mondayOf(base);
  const weekEnd = addDaysIso(weekStart, 6);

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const [entriesRes, activitesRes, clientsRes] = await Promise.all([
    user
      ? sb
          .from("time_entries")
          .select(
            "id, client_id, categorie_autre, activite_id, date_jour, duree_minutes, annee, commentaire, facturable, clients(denomination, slug), time_activites(libelle)"
          )
          .eq("user_id", user.id)
          .gte("date_jour", weekStart)
          .lte("date_jour", weekEnd)
          .order("date_jour", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    sb.from("time_activites").select("id, libelle").eq("actif", true).order("ordre"),
    sb.from("clients").select("id, denomination, pipeline_statut, origine").order("denomination"),
  ]);

  type Row = {
    id: string;
    client_id: string | null;
    categorie_autre: string | null;
    activite_id: string | null;
    date_jour: string;
    duree_minutes: number;
    annee: number;
    commentaire: string | null;
    facturable: boolean;
    clients: { denomination: string; slug: string } | null;
    time_activites: { libelle: string } | null;
  };

  const entries = ((entriesRes.data ?? []) as unknown as Row[]).map((e) => ({
    id: e.id,
    clientId: e.client_id,
    clientName: e.clients?.denomination ?? null,
    clientSlug: e.clients?.slug ?? null,
    categorieAutre: e.categorie_autre,
    activiteId: e.activite_id,
    activiteLibelle: e.time_activites?.libelle ?? null,
    dateJour: e.date_jour,
    dureeMinutes: e.duree_minutes,
    annee: e.annee,
    commentaire: e.commentaire,
    facturable: e.facturable,
  }));

  const activites = ((activitesRes.data ?? []) as { id: string; libelle: string }[]).map(
    (a) => ({ id: a.id, libelle: a.libelle })
  );

  const clients = ((clientsRes.data ?? []) as {
    id: string;
    denomination: string;
    pipeline_statut: string | null;
    origine: string | null;
  }[])
    .filter((c) => isClientBillable(c))
    .map((c) => ({ id: c.id, denomination: c.denomination }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes temps"
        description="Saisissez votre temps par dossier comptable. Hors dossier : choisissez « Autre » et précisez en commentaire."
      />
      <MesTemps
        weekStart={weekStart}
        entries={entries}
        activites={activites}
        clients={clients}
      />
    </div>
  );
}
