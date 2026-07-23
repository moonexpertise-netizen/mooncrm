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
import { ClotureSplit, EditableBilanOffert, EditableGestionTns, EditableTextArea } from "./editable-extras";
import AdjustHonorairesModal from "./adjust-honoraires-modal";
import { Card, FieldReadonly, SectionTitle } from "./_components";
import { loadClient, loadContactsLink, loadActiveTvaTags, extractDirigeant } from "./_data";
import type { PipelineStatut } from "./actions";
import TvaFieldsCard from "./tva-fields-card";
import TempsCard from "./temps-card";

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
  const id = client.id;

  // Ces 3 valeurs ne dépendent que de `client` (déjà chargé).
  const currentTvaTagId = (client as unknown as { tva_tag_id: string | null }).tva_tag_id ?? null;
  const currentTvaEcheanceJour = (client as unknown as { tva_echeance_jour: number | null }).tva_echeance_jour ?? null;
  const groupeNom = (client.groupes as unknown as { nom: string } | null)?.nom ?? null;

  // Les 3 requêtes restantes sont indépendantes entre elles -> on les lance en
  // parallèle (au lieu de 3 allers-retours séquentiels) :
  //   - contacts rattachés au client
  //   - liste des groupes (datalist EditableGroupe)
  //   - étiquettes TVA actives (+ le tag courant s'il est inactif)
  const sb = await createClient();
  const [contactsLink, allGroupesRes, tvaTags] = await Promise.all([
    loadContactsLink(client.id),
    sb.from("groupes").select("nom").order("nom"),
    loadActiveTvaTags(currentTvaTagId),
  ]);
  const dirigeantContact = extractDirigeant(contactsLink);
  const groupesOptions = (allGroupesRes.data ?? []).map((g) => g.nom);

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
        {/* Les MONTANTS sont en lecture seule : ils se modifient uniquement via
            "Ajuster les honoraires" (motif obligatoire, journalisé dans
            l'Historique). Les TYPES (Facturés/Inclus, périodicité) restent
            modifiables directement. */}
        <div className="flex justify-end -mt-1 mb-1">
          <AdjustHonorairesModal
            clientId={id}
            compta={client.honoraires_compta ?? 0}
            typeBilan={client.type_honos_bilans}
            forfaitBilan={client.forfait_bilan ?? 0}
            typeJur={client.type_honos_jur}
            honosJur={client.honoraires_jur ?? 0}
            tdbPeriode={client.tdb_periode}
            tdbHonosPeriode={client.tdb_honos_periode ?? 0}
            ossPeriode={client.oss_periode}
            ossHonosTrimestre={client.oss_honos_trimestre ?? 0}
          />
        </div>
        <FieldReadonly label="Forfait comptable" value={`${fmtEuro(client.honoraires_compta ?? 0) ?? "0 €"} /mois`} />
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_bilans" value={client.type_honos_bilans} label="Forfait bilan" options={["Facturés", "Inclus"]} permission="edit_honoraires" />
          {client.type_honos_bilans === "Facturés" && (
            <>
              <FieldReadonly label="↳ Montant / an" value={fmtEuro(client.forfait_bilan ?? 0) ?? "0 €"} />
              {/* 1er bilan offert : flag LDM + passe auto le 1er bilan facturable
                  en statut de facturation "Offert" (cf. setBilanPremierOffert). */}
              <EditableBilanOffert clientId={id} value={client.bilan_premier_offert === true} label="↳ 1ᵉʳ bilan offert" />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_jur" value={client.type_honos_jur} label="Forfait juridique" options={["Facturés", "Inclus", "Non souscrit"]} permission="edit_honoraires" />
          {client.type_honos_jur === "Facturés" && (
            <FieldReadonly label="↳ Montant / an" value={fmtEuro(client.honoraires_jur ?? 0) ?? "0 €"} />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="tdb_periode" value={client.tdb_periode} label="Forfait pilotage" options={["Mensuel", "Trimestriel", "Non souscrit"]} permission="edit_honoraires" />
          {(client.tdb_periode === "Mensuel" || client.tdb_periode === "Trimestriel") && (
            <>
              <FieldReadonly
                label={`↳ Montant / ${client.tdb_periode === "Mensuel" ? "mois" : "trimestre"}`}
                value={fmtEuro(client.tdb_honos_periode ?? 0) ?? "0 €"}
              />
              <FieldReadonly
                label="↳ Équivalent mensuel"
                value={fmtEuro(client.forfait_pilotage ?? 0) ?? "-"}
              />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          {/* Guichet unique - OSS : calqué sur le pilotage mais toujours
              trimestriel (déclaration OSS trimestrielle). */}
          <EditableSelect clientId={id} field="oss_periode" value={client.oss_periode} label="Guichet unique - OSS" options={["Trimestriel", "Non souscrit"]} permission="edit_honoraires" />
          {client.oss_periode === "Trimestriel" && (
            <>
              <FieldReadonly label="↳ Montant / trimestre" value={fmtEuro(client.oss_honos_trimestre ?? 0) ?? "0 €"} />
              <FieldReadonly
                label="↳ Équivalent mensuel"
                value={fmtEuro(client.forfait_oss ?? 0) ?? "-"}
              />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          {/* Forfait de début d'activité : tarif mensuel réduit la 1ère année
              jusqu'à une condition. Impact = lettre de mission uniquement
              (n'entre PAS dans le MRR, qui reste au tarif de croisière). */}
          <EditableNumber clientId={id} field="forfait_debut_montant" value={client.forfait_debut_montant} label="Forfait de début (€/mois)" unit="eur" permission="edit_honoraires" placeholder="0 = aucun" />
          {client.forfait_debut_montant > 0 && (
            <>
              <EditableDate clientId={id} field="forfait_debut_date_debut" value={client.forfait_debut_date_debut} label="↳ À compter du" permission="edit_honoraires" />
              <EditableSelect clientId={id} field="forfait_debut_condition" value={client.forfait_debut_condition} label="↳ Fin du forfait" options={["Début de facturation", "Nombre de mois", "Date"]} permission="edit_honoraires" />
              {client.forfait_debut_condition === "Début de facturation" && (
                /* Borne LDM : "(N échéances maximum)". Select 1..6 — la valeur
                   string est castée en integer par PostgREST. */
                <EditableSelect clientId={id} field="forfait_debut_nb_echeances" value={client.forfait_debut_nb_echeances == null ? null : String(client.forfait_debut_nb_echeances)} label="↳ Échéances maximum" options={["1", "2", "3", "4", "5", "6"]} permission="edit_honoraires" />
              )}
              {client.forfait_debut_condition === "Nombre de mois" && (
                <EditableNumber clientId={id} field="forfait_debut_nb_mois" value={client.forfait_debut_nb_mois} label="↳ Nombre de mois" unit="plain" permission="edit_honoraires" />
              )}
              {client.forfait_debut_condition === "Date" && (
                <EditableDate clientId={id} field="forfait_debut_date_fin" value={client.forfait_debut_date_fin} label="↳ Jusqu'au" permission="edit_honoraires" />
              )}
              {client.forfait_debut_termine === true && (
                <FieldReadonly label="↳ Statut" value="Terminé (rythme de croisière)" />
              )}
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
          <EditableSelect clientId={id} field="type_honos_creation" value={client.type_honos_creation} label="Forfait création" options={["Facturés", "Non souscrit"]} permission="edit_honoraires" />
          {client.type_honos_creation === "Facturés" && (
            <EditableNumber clientId={id} field="honoraires_creation" value={client.honoraires_creation} label="↳ Montant" unit="eur" permission="edit_honoraires" />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_reprise" value={client.type_honos_reprise} label="Forfait reprise" options={["Facturés", "Non souscrit"]} permission="edit_honoraires" />
          {client.type_honos_reprise === "Facturés" && (
            <EditableNumber clientId={id} field="honoraires_reprise" value={client.honoraires_reprise} label="↳ Montant" unit="eur" permission="edit_honoraires" />
          )}
        </div>
      </Card>

      <TempsCard clientId={id} honorairesCompta={client.honoraires_compta} />

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
