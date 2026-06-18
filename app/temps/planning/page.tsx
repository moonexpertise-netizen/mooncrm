import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import Planning from "./planning";

export const dynamic = "force-dynamic";

function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const diff = (d.getUTCDay() + 6) % 7;
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
/** "prenom.nom@x.fr" -> "Prenom Nom" (on n'affiche pas l'email brut). */
function displayName(email: string | null): string {
  if (!email) return "Inconnu";
  const local = email.split("@")[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function PlanningPage({
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

  const [entriesRes, profilesRes, activitesRes, clientsRes] = await Promise.all([
    sb
      .from("time_entries")
      .select(
        "id, user_id, client_id, categorie_autre, activite_id, date_jour, duree_minutes, commentaire, facturable, clients(denomination, slug), time_activites(libelle)"
      )
      .gte("date_jour", weekStart)
      .lte("date_jour", weekEnd)
      .order("date_jour", { ascending: true }),
    sb.from("profiles").select("id, email").eq("approved", true),
    sb.from("time_activites").select("id, libelle").eq("actif", true).order("ordre"),
    sb.from("clients").select("id, denomination, pipeline_statut, origine").order("denomination"),
  ]);

  const profMap = new Map<string, string>();
  for (const p of (profilesRes.data ?? []) as { id: string; email: string | null }[]) {
    profMap.set(p.id, displayName(p.email));
  }

  type Row = {
    id: string;
    user_id: string;
    client_id: string | null;
    categorie_autre: string | null;
    activite_id: string | null;
    date_jour: string;
    duree_minutes: number;
    commentaire: string | null;
    facturable: boolean;
    clients: { denomination: string; slug: string } | null;
    time_activites: { libelle: string } | null;
  };

  const entries = ((entriesRes.data ?? []) as unknown as Row[]).map((e) => ({
    id: e.id,
    userId: e.user_id,
    collaborateur: profMap.get(e.user_id) ?? "Inconnu",
    clientId: e.client_id,
    clientName: e.clients?.denomination ?? null,
    clientSlug: e.clients?.slug ?? null,
    categorieAutre: e.categorie_autre,
    activiteId: e.activite_id,
    activiteLibelle: e.time_activites?.libelle ?? null,
    dateJour: e.date_jour,
    dureeMinutes: e.duree_minutes,
    commentaire: e.commentaire,
    facturable: e.facturable,
  }));

  // Collaborateurs présents (pour le filtre) : ceux qui ont des lignes cette
  // semaine + tous les approuvés (pour pouvoir filtrer même sans saisie).
  const collaborateurs = [...profMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const clients = ((clientsRes.data ?? []) as {
    id: string;
    denomination: string;
    pipeline_statut: string | null;
    origine: string | null;
  }[])
    .filter((c) => isClientBillable(c))
    .map((c) => ({ id: c.id, denomination: c.denomination }));

  const activites = ((activitesRes.data ?? []) as { id: string; libelle: string }[]).map(
    (a) => ({ id: a.id, libelle: a.libelle })
  );

  return (
    <Planning
      weekStart={weekStart}
      entries={entries}
      collaborateurs={collaborateurs}
      clients={clients}
      activites={activites}
    />
  );
}
