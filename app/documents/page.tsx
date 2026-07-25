import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import { missingLdmFields } from "@/app/clients/[slug]/ldm-checklist";
import BulkDocuments, { type DocClient } from "./bulk-documents";

export const dynamic = "force-dynamic";

/**
 * Génération en masse de documents SANS saisie (LDM Présentation / BNC / PAIE).
 * On sélectionne des dossiers, on choisit le type, on télécharge un ZIP.
 * Les attestations (valeurs propres à chaque dossier) restent unitaires.
 */
export default async function DocumentsPage() {
  const sb = await createClient();
  const { data: clients } = await sb
    .from("clients")
    .select(
      "id, denomination, pipeline_statut, forme, adresse_siege, code_postal, ville, activite, mois_cloture, fin_mission_date"
    )
    .order("denomination");

  const ids = (clients ?? []).map((c) => c.id);
  const { data: links } = ids.length
    ? await sb
        .from("client_contacts")
        .select("client_id, contacts(nom, prenom, civilite)")
        .in("client_id", ids)
    : { data: [] as unknown[] };

  const dirByClient = new Map<string, { civilite: string | null; prenom: string | null; nom: string | null }>();
  for (const l of (links ?? []) as unknown as Array<{ client_id: string; contacts: { nom: string | null; prenom: string | null; civilite: string | null } | null }>) {
    if (!dirByClient.has(l.client_id) && l.contacts) dirByClient.set(l.client_id, l.contacts);
  }

  const rows: DocClient[] = (clients ?? []).map((c) => {
    const d = dirByClient.get(c.id) ?? null;
    // Champs cœur requis par toute LDM (hors honoraires, qui dépendent du type).
    const missing = missingLdmFields({
      denomination: c.denomination,
      adresse: c.adresse_siege,
      codePostal: c.code_postal,
      ville: c.ville,
      activite: c.activite,
      moisCloture: c.mois_cloture,
      finMission: c.fin_mission_date,
      civilite: d?.civilite ?? null,
      prenom: d?.prenom ?? null,
      nom: d?.nom ?? null,
    });
    return {
      id: c.id,
      denomination: c.denomination,
      forme: c.forme,
      pipeline_statut: c.pipeline_statut,
      missing,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Génération en masse des lettres de mission (Présentation / BNC / PAIE)"
      />
      <BulkDocuments rows={rows} />
    </div>
  );
}
