import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import { countMissionExcComments } from "./comments-actions";
import MissionExcTable, {
  type MissionExcRow,
  type MissionExcType,
  type MissionExcClientOption,
} from "./mission-exc-table";

export const dynamic = "force-dynamic";

/**
 * Module "Missions Exceptionnelles" - gestion des missions ponctuelles non
 * recurrentes (transferts de siege, CAA, evaluations, attestations, AG
 * extraordinaires, audits ponctuels...).
 *
 * Cf. migration 0048 : missions_exceptionnelles + mission_exc_types (editable).
 *
 * Trois requetes en parallele :
 *   - missions : la table principale
 *   - types    : liste editable des types (referentiel)
 *   - clients  : pour proposer un picker (FK ou texte libre)
 */
export default async function MissionsExcPage() {
  const sb = await createClient();

  // Query missions defensive : si ldm_statut column missing (migration 0049
  // pas appliquee), on retombe sur une query sans cette colonne.
  const missionsCols =
    "id, slug, client_id, client_libre, mission, type_id, description, duree_theorique_h, duree_reelle_h, taux_horaire, forfait, etat_mission, etat_facturation, ldm_statut, date_debut, date_fin, created_at, clients(slug, denomination)";
  const missionsColsFallback =
    "id, slug, client_id, client_libre, mission, type_id, description, duree_theorique_h, duree_reelle_h, taux_horaire, forfait, etat_mission, etat_facturation, date_debut, date_fin, created_at, clients(slug, denomination)";
  const [
    missionsRes,
    { data: types },
    { data: clients },
  ] = await Promise.all([
    sb
      .from("missions_exceptionnelles")
      .select(missionsCols)
      .order("date_debut", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    sb
      .from("mission_exc_types")
      .select("id, slug, label, ordre, actif")
      .order("ordre", { ascending: true }),
    sb
      .from("clients")
      .select("id, slug, denomination")
      .order("denomination", { ascending: true }),
  ]);
  let missions = missionsRes.data;
  if (missionsRes.error && /ldm_statut/i.test(missionsRes.error.message)) {
    const fb = await sb
      .from("missions_exceptionnelles")
      .select(missionsColsFallback)
      .order("date_debut", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    missions = (fb.data ?? []).map((m) => ({ ...m, ldm_statut: "a_faire" }));
  }

  // Supabase retourne la jointure clients() sous forme d'array meme avec .single
  // implicite. On normalise vers un objet (premier element ou null).
  type RawMission = {
    id: string;
    slug: string;
    client_id: string | null;
    client_libre: string | null;
    mission: string;
    type_id: string | null;
    description: string | null;
    duree_theorique_h: number | null;
    duree_reelle_h: number | null;
    taux_horaire: number | null;
    forfait: number | null;
    etat_mission: string;
    etat_facturation: string | null;
    ldm_statut: string;
    date_debut: string | null;
    date_fin: string | null;
    created_at: string;
    clients: { slug: string; denomination: string } | Array<{ slug: string; denomination: string }> | null;
  };

  const rows: MissionExcRow[] = ((missions ?? []) as unknown as RawMission[]).map((m) => {
    const clientObj = Array.isArray(m.clients) ? m.clients[0] ?? null : m.clients;
    return {
      id: m.id,
      slug: m.slug,
      client_id: m.client_id,
      client_libre: m.client_libre,
      client_slug: clientObj?.slug ?? null,
      client_denomination: clientObj?.denomination ?? null,
      mission: m.mission,
      type_id: m.type_id,
      description: m.description,
      duree_theorique_h: m.duree_theorique_h,
      duree_reelle_h: m.duree_reelle_h,
      taux_horaire: m.taux_horaire,
      forfait: m.forfait,
      etat_mission: m.etat_mission as MissionExcRow["etat_mission"],
      etat_facturation: m.etat_facturation as MissionExcRow["etat_facturation"],
      ldm_statut: (m.ldm_statut ?? "a_faire") as MissionExcRow["ldm_statut"],
      date_debut: m.date_debut,
      date_fin: m.date_fin,
    };
  });

  const typesList: MissionExcType[] = (types ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    label: t.label,
    ordre: t.ordre,
    actif: t.actif,
  }));

  const clientOptions: MissionExcClientOption[] = (clients ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
  }));

  // Compteurs commentaires + email user courant (pour le popover commentaires)
  const [commentCounts, { data: { user } }] = await Promise.all([
    countMissionExcComments(rows.map((r) => r.id)),
    sb.auth.getUser(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Missions exceptionnelles"
        description="Suivi des missions ponctuelles (transferts de siège, CAA, évaluations, attestations, AG extraordinaires, audits…)"
      />
      <MissionExcTable
        rows={rows}
        types={typesList}
        clientOptions={clientOptions}
        initialCommentCounts={commentCounts}
        currentUserEmail={user?.email ?? null}
      />
    </div>
  );
}
