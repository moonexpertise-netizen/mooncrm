import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtEuro } from "@/lib/utils";
import PipelinePicker from "./pipeline-picker";
import ContactsCard, { type ContactRow } from "./contacts-card";
import {
  EditableContactCivilite,
  EditableContactText,
  EditableDate,
  EditableGroupe,
  EditableNumber,
  EditableSelect,
  EditableText,
} from "./editable";
import { ClotureSplit, EditableGestionTns, EditableTextArea } from "./editable-extras";
import { Card, FieldReadonly, SectionTitle } from "./_components";
import { loadClient, loadContactsLink, loadActiveTvaTags, extractDirigeant } from "./_data";
import type { PipelineStatut } from "./actions";
import TvaFieldsCard from "./tva-fields-card";

export const dynamic = "force-dynamic";

const FORME_VALUES = [
  "ASSO", "SA", "SCI", "EI", "SARL", "SAS", "SELARL", "SELAS",
  "SCM", "SC", "EURL", "SASU", "INDIV", "AARPI", "LMNP",
] as const;

const ORIGINE_VALUES = [
  "1 - Création",
  "2 - Reprise",
  "3 - Reprise sans EC",
  "4 - Interne",
  "5 - Sous-traitance",
] as const;

/**
 * Onglet "Identité" de la fiche client. Le header + tabs sont gérés par
 * le layout.tsx parent. Sections : Pipeline, Infos de base, Honoraires,
 * Détails CRM, Contacts.
 */
export default async function IdentiteTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await loadClient(slug);
  if (!client) notFound();
  const contactsLink = await loadContactsLink(client.id);
  const dirigeantContact = extractDirigeant(contactsLink);
  const id = client.id;

  // Liste des groupes pour le datalist EditableGroupe
  const sb = await createClient();
  const { data: allGroupes } = await sb.from("groupes").select("nom").order("nom");
  const groupesOptions = (allGroupes ?? []).map((g) => g.nom);
  const groupeNom = (client.groupes as unknown as { nom: string } | null)?.nom ?? null;

  // Etiquettes TVA pour le picker (actives + l'unique tag courant s'il est inactif)
  const currentTvaTagId = (client as unknown as { tva_tag_id: string | null }).tva_tag_id ?? null;
  const currentTvaEcheanceJour = (client as unknown as { tva_echeance_jour: number | null }).tva_echeance_jour ?? null;
  const tvaTags = await loadActiveTvaTags(currentTvaTagId);

  return (
    <div className="space-y-5">
      <Card title="Pipeline">
        <PipelinePicker
          clientId={id}
          current={(client.pipeline_statut as PipelineStatut | null) ?? null}
        />
      </Card>

      {/* SECTION 1 - INFOS DE BASE */}
      <SectionTitle
        n={1}
        title="Infos de base"
        sub="Identité du dossier et coordonnées, alimentent la lettre de mission"
      />
      <Card title="Identité du dossier">
        {dirigeantContact ? (
          <>
            <EditableContactCivilite
              contactId={dirigeantContact.id}
              value={dirigeantContact.civilite}
              label="Civilité dirigeant"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="prenom"
              value={dirigeantContact.prenom}
              label="Prénom dirigeant"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="nom"
              value={dirigeantContact.nom}
              label="Nom dirigeant"
              required
            />
          </>
        ) : (
          <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm items-center">
            <div className="text-muted-foreground">Dirigeant</div>
            <div className="px-2 py-1 -mx-2 rounded bg-amber-50 text-amber-700 text-xs">
              Aucun contact rattaché, ajouter un contact dans la carte Contacts ↓
            </div>
          </div>
        )}
        <EditableText clientId={id} field="email" value={client.email} label="Adresse mail" />
        <EditableText clientId={id} field="activite" value={client.activite} label="Activité" />
        <EditableDate clientId={id} field="fin_mission_date" value={client.fin_mission_date} label="Clôture 1ère mission" />
        <EditableText clientId={id} field="adresse_siege" value={client.adresse_siege} label="Adresse ligne 1" />
        <EditableText clientId={id} field="code_postal" value={client.code_postal} label="Code postal" />
        <EditableText clientId={id} field="ville" value={client.ville} label="Ville" />
      </Card>

      {/* SECTION 2 - HONORAIRES */}
      <SectionTitle
        n={2}
        title="Honoraires"
        sub="Forfaits qui alimentent la lettre de mission"
      />
      <Card title="Forfaits récurrents">
        <EditableNumber clientId={id} field="honoraires_compta" value={client.honoraires_compta} label="Forfait comptable" unit="eur" />
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_bilans" value={client.type_honos_bilans} label="Forfait bilan" options={["Facturés", "Inclus"]} />
          {client.type_honos_bilans === "Facturés" && (
            <EditableNumber clientId={id} field="forfait_bilan" value={client.forfait_bilan} label="↳ Montant" unit="eur" />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_jur" value={client.type_honos_jur} label="Forfait juridique" options={["Facturés", "Inclus", "Non souscrit"]} />
          {client.type_honos_jur === "Facturés" && (
            <EditableNumber clientId={id} field="honoraires_jur" value={client.honoraires_jur} label="↳ Montant" unit="eur" />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="tdb_periode" value={client.tdb_periode} label="Forfait pilotage" options={["Mensuel", "Trimestriel", "Non souscrit"]} />
          {(client.tdb_periode === "Mensuel" || client.tdb_periode === "Trimestriel") && (
            <>
              <EditableNumber
                clientId={id}
                field="tdb_honos_periode"
                value={client.tdb_honos_periode}
                label={`↳ Montant / ${client.tdb_periode === "Mensuel" ? "mois" : "trimestre"}`}
                unit="eur"
              />
              <FieldReadonly
                label="↳ Équivalent mensuel"
                value={fmtEuro(client.forfait_pilotage ?? 0) ?? "-"}
              />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-2 space-y-0.5">
          <FieldReadonly label="MRR" value={fmtEuro(client.mrr ?? 0) ?? "-"} />
          <FieldReadonly label="ARR" value={fmtEuro(client.arr ?? 0) ?? "-"} />
        </div>
      </Card>

      <Card title="Honoraires one-shot">
        <div>
          <EditableSelect clientId={id} field="type_honos_creation" value={client.type_honos_creation} label="Forfait création" options={["Facturés", "Non souscrit"]} />
          {client.type_honos_creation === "Facturés" && (
            <EditableNumber clientId={id} field="honoraires_creation" value={client.honoraires_creation} label="↳ Montant" unit="eur" />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_reprise" value={client.type_honos_reprise} label="Forfait reprise" options={["Facturés", "Non souscrit"]} />
          {client.type_honos_reprise === "Facturés" && (
            <EditableNumber clientId={id} field="honoraires_reprise" value={client.honoraires_reprise} label="↳ Montant" unit="eur" />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableNumber clientId={id} field="exceptionnel" value={client.exceptionnel} label="Honos exceptionnels" unit="eur" />
        </div>
      </Card>

      {/* SECTION 3 - DÉTAILS CRM */}
      <SectionTitle
        n={3}
        title="Détails CRM"
        sub="Suivi interne, n'apparaît pas dans la lettre de mission"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Identité légale">
          <EditableText clientId={id} field="siren" value={client.siren} label="SIREN" />
          <EditableSelect clientId={id} field="forme" value={client.forme} label="Forme juridique" options={FORME_VALUES} />
          <EditableSelect clientId={id} field="origine" value={client.origine} label="Origine" options={ORIGINE_VALUES} />
          <EditableGroupe clientId={id} value={groupeNom} label="Groupe" options={groupesOptions} />
        </Card>

        <Card title="Dates de gestion">
          <ClotureSplit clientId={id} jour={client.jour_cloture} mois={client.mois_cloture} />
          <EditableDate clientId={id} field="debut_obligations" value={client.debut_obligations} label="Reprise à partir de" />
          <EditableDate clientId={id} field="mois_signature" value={client.mois_signature} label="Date signature LDM" />
          <EditableGestionTns clientId={id} value={client.gestion_tns} label="Gestion TNS" />
        </Card>

        <Card title="TVA mensuelle">
          <TvaFieldsCard
            clientId={id}
            initialTagId={currentTvaTagId}
            initialEcheanceJour={currentTvaEcheanceJour}
            tags={tvaTags}
          />
        </Card>
      </div>

      <Card title="Notes">
        <EditableTextArea clientId={id} field="note_pdc" value={client.note_pdc} label="Note PDC" />
        <EditableTextArea clientId={id} field="ldm_social" value={client.ldm_social} label="LDM social" />
      </Card>

      <ContactsCard
        clientId={id}
        contacts={(contactsLink ?? []).map((cc) => {
          const c = cc.contacts as unknown as {
            id: string;
            nom: string;
            prenom: string | null;
            email: string | null;
            telephone: string | null;
            civilite: "M." | "Mme" | "Mlle" | null;
          } | null;
          return c
            ? {
                contactId: c.id,
                nom: c.nom,
                prenom: c.prenom,
                email: c.email,
                telephone: c.telephone,
                civilite: c.civilite,
                role: cc.role ?? null,
              }
            : null;
        }).filter(Boolean) as ContactRow[]}
      />
    </div>
  );
}
