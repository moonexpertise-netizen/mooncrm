import { notFound } from "next/navigation";
import { fmtEuro } from "@/lib/utils";
import {
  EditableDate,
  EditableNumber,
  EditableSelect,
} from "../editable";
import { EditableBilanOffert } from "../editable-extras";
import PlanHonorairesLock from "../plan-honoraires-lock";
import { Card, FieldReadonly } from "../_components";
import { loadClient } from "../_data";

export const dynamic = "force-dynamic";

/**
 * Onglet "Honoraires" : tout le volet économique du dossier.
 *   - Forfaits récurrents (compta, bilan, juridique, pilotage, OSS, forfait
 *     de début d'activité) + MRR/ARR dérivés
 *   - Honoraires one-shot (création, reprise)
 *
 * Saisie : tant que le plan n'est pas verrouillé, TOUS les montants sont
 * éditables directement. Une fois verrouillé, ils passent en lecture seule et
 * rouvrir demande une justification unique ("Nouveau plan d'honoraires"),
 * journalisée dans l'Historique.
 */
export default async function HonorairesTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await loadClient(slug);
  if (!client) notFound();
  const id = client.id;

  /**
   * Plan d'honoraires verrouillé ? Tant qu'il ne l'est pas, TOUS les montants
   * sont saisissables librement — on ne verrouille jamais champ par champ.
   * Le verrouillage est un geste unique de fin de saisie ; pour rouvrir, on
   * ouvre un "nouveau plan" en justifiant une seule fois.
   */
  const verrouille = (client as unknown as { honoraires_verrouille?: boolean }).honoraires_verrouille === true;
  const verrouilleAt = (client as unknown as { honoraires_verrouille_at?: string | null }).honoraires_verrouille_at ?? null;
  const editable = !verrouille;

  return (
    <div className="space-y-5">
      <Card title="Forfaits récurrents">
        <div className="-mt-1 mb-2">
          <PlanHonorairesLock clientId={id} verrouille={verrouille} verrouilleAt={verrouilleAt} />
        </div>
        {editable ? (
          <EditableNumber clientId={id} field="honoraires_compta" value={client.honoraires_compta} label="Forfait comptable (€/mois)" unit="eur" permission="edit_honoraires" />
        ) : (
          <FieldReadonly label="Forfait comptable" value={`${fmtEuro(client.honoraires_compta ?? 0) ?? "0 €"} /mois`} />
        )}
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_bilans" value={client.type_honos_bilans} label="Forfait bilan" options={["Facturés", "Inclus"]} permission="edit_honoraires" />
          {client.type_honos_bilans === "Facturés" && (
            <>
              {editable ? (
                <EditableNumber clientId={id} field="forfait_bilan" value={client.forfait_bilan} label="↳ Montant / an" unit="eur" permission="edit_honoraires" />
              ) : (
                <FieldReadonly label="↳ Montant / an" value={fmtEuro(client.forfait_bilan ?? 0) ?? "0 €"} />
              )}
              <EditableBilanOffert clientId={id} value={client.bilan_premier_offert === true} label="↳ 1ᵉʳ bilan offert" />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="type_honos_jur" value={client.type_honos_jur} label="Forfait juridique" options={["Facturés", "Inclus", "Non souscrit"]} permission="edit_honoraires" />
          {client.type_honos_jur === "Facturés" &&
            (editable ? (
              <EditableNumber clientId={id} field="honoraires_jur" value={client.honoraires_jur} label="↳ Montant / an" unit="eur" permission="edit_honoraires" />
            ) : (
              <FieldReadonly label="↳ Montant / an" value={fmtEuro(client.honoraires_jur ?? 0) ?? "0 €"} />
            ))}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect clientId={id} field="tdb_periode" value={client.tdb_periode} label="Forfait pilotage" options={["Mensuel", "Trimestriel", "Non souscrit"]} permission="edit_honoraires" />
          {(client.tdb_periode === "Mensuel" || client.tdb_periode === "Trimestriel") && (
            <>
              {editable ? (
                <EditableNumber clientId={id} field="tdb_honos_periode" value={client.tdb_honos_periode} label={`↳ Montant / ${client.tdb_periode === "Mensuel" ? "mois" : "trimestre"}`} unit="eur" permission="edit_honoraires" />
              ) : (
                <FieldReadonly
                  label={`↳ Montant / ${client.tdb_periode === "Mensuel" ? "mois" : "trimestre"}`}
                  value={fmtEuro(client.tdb_honos_periode ?? 0) ?? "0 €"}
                />
              )}
              <FieldReadonly label="↳ Équivalent mensuel" value={fmtEuro(client.forfait_pilotage ?? 0) ?? "-"} />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          {/* Guichet unique - OSS : calqué sur le pilotage mais toujours
              trimestriel (déclaration OSS trimestrielle). */}
          <EditableSelect clientId={id} field="oss_periode" value={client.oss_periode} label="Guichet unique - OSS" options={["Trimestriel", "Non souscrit"]} permission="edit_honoraires" />
          {client.oss_periode === "Trimestriel" && (
            <>
              {editable ? (
                <EditableNumber clientId={id} field="oss_honos_trimestre" value={client.oss_honos_trimestre} label="↳ Montant / trimestre" unit="eur" permission="edit_honoraires" />
              ) : (
                <FieldReadonly label="↳ Montant / trimestre" value={fmtEuro(client.oss_honos_trimestre ?? 0) ?? "0 €"} />
              )}
              <FieldReadonly label="↳ Équivalent mensuel" value={fmtEuro(client.forfait_oss ?? 0) ?? "-"} />
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
    </div>
  );
}
