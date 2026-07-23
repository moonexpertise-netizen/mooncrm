import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EditableContactCivilite,
  EditableContactText,
  EditableDate,
  EditableGroupe,
  EditableSelect,
  EditableText,
} from "./editable";
import { ClotureSplit, EditableTextArea } from "./editable-extras";
import { Card, FieldReadonly } from "./_components";
import { loadClient, loadContactsLink, extractDirigeant } from "./_data";
import LdmChecklist from "./ldm-checklist";
import AddDirigeantButton from "./add-dirigeant-button";

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
 * Onglet "Informations" de la fiche client.
 *
 * Contenu volontairement resserré sur l'identité du dossier, dans l'ordre de
 * saisie voulu par Benjamin. Le pipeline est dans le layout (visible partout),
 * les honoraires / obligations / temps ont leurs propres onglets.
 *
 * Le DIRIGEANT est stocké dans `contacts` (c'est lui qui alimente la LDM) mais
 * s'édite directement ici : plus de carte "Contacts" séparée.
 */
export default async function InformationsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await loadClient(slug);
  if (!client) notFound();
  const id = client.id;

  const groupeNom = (client.groupes as unknown as { nom: string } | null)?.nom ?? null;

  const sb = await createClient();
  const [contactsLink, allGroupesRes] = await Promise.all([
    loadContactsLink(client.id),
    sb.from("groupes").select("nom").order("nom"),
  ]);
  const dirigeantContact = extractDirigeant(contactsLink);
  const groupesOptions = (allGroupesRes.data ?? []).map((g) => g.nom);

  return (
    <div className="space-y-5">
      {/* Complétude LDM : liste ce qui manque pour sortir une lettre de
          mission propre. Avertit sans bloquer (décision Benjamin). */}
      <LdmChecklist
        denomination={client.denomination}
        adresse={client.adresse_siege}
        codePostal={client.code_postal}
        ville={client.ville}
        activite={client.activite}
        moisCloture={client.mois_cloture}
        finMission={client.fin_mission_date}
        civilite={dirigeantContact?.civilite ?? null}
        prenom={dirigeantContact?.prenom ?? null}
        nom={dirigeantContact?.nom ?? null}
      />

      <Card title="Société">
        <FieldReadonly label="Nom du dossier" value={client.denomination} />
        <EditableSelect clientId={id} field="forme" value={client.forme} label="Forme juridique" options={FORME_VALUES} />
        {/* SIREN vide = société en cours d'immatriculation : on l'affiche
            explicitement plutôt qu'un blanc ambigu. */}
        <EditableText clientId={id} field="siren" value={client.siren} label="SIREN" placeholder="EN COURS" />
        <EditableText clientId={id} field="adresse_siege" value={client.adresse_siege} label="Adresse ligne 1" />
        <EditableText clientId={id} field="code_postal" value={client.code_postal} label="Code postal" />
        <EditableText clientId={id} field="ville" value={client.ville} label="Ville" />
        <EditableText clientId={id} field="activite" value={client.activite} label="Activité" />
        <ClotureSplit clientId={id} jour={client.jour_cloture} mois={client.mois_cloture} />
      </Card>

      <Card title="Dirigeant">
        {dirigeantContact ? (
          <>
            <EditableContactCivilite
              contactId={dirigeantContact.id}
              value={dirigeantContact.civilite}
              label="Civilité"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="nom"
              value={dirigeantContact.nom}
              label="Nom"
              required
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="prenom"
              value={dirigeantContact.prenom}
              label="Prénom"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="telephone"
              value={dirigeantContact.telephone}
              label="Téléphone"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="email"
              value={dirigeantContact.email}
              label="Adresse mail"
            />
          </>
        ) : (
          <AddDirigeantButton clientId={id} />
        )}
      </Card>

      <Card title="Suivi du dossier">
        <EditableGroupe clientId={id} value={groupeNom} label="Groupe" options={groupesOptions} />
        <EditableSelect clientId={id} field="origine" value={client.origine} label="Origine" options={ORIGINE_VALUES} />
        <EditableDate clientId={id} field="fin_mission_date" value={client.fin_mission_date} label="1ère clôture ensemble" />
        <EditableDate clientId={id} field="debut_obligations" value={client.debut_obligations} label="Reprise à partir de" />
        {/* Renseignée automatiquement au passage du pipeline en "LDM signée". */}
        <EditableDate clientId={id} field="mois_signature" value={client.mois_signature} label="Date signature LDM" />
      </Card>

      <Card title="Notes">
        <EditableTextArea clientId={id} field="note_pdc" value={client.note_pdc} label="Note PDC" />
        <EditableTextArea clientId={id} field="ldm_social" value={client.ldm_social} label="LDM social" />
      </Card>
    </div>
  );
}
