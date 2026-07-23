import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Bandeau "Prêt pour la lettre de mission".
 *
 * Liste les champs obligatoires encore vides. AVERTIT sans bloquer : Benjamin
 * garde la main pour sortir un brouillon (cf. décision produit). Le bouton
 * "Générer LDM" affiche le même diagnostic.
 *
 * Composant serveur : aucune interactivité, juste un calcul d'état.
 */

/** Champs requis pour une LDM complète. Source unique de vérité, réutilisée
 *  par le bouton de génération. */
export function missingLdmFields(c: {
  denomination?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  activite?: string | null;
  moisCloture?: number | null;
  finMission?: string | null;
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  /** Montants qui alimentent le paragraphe honoraires de la LDM. Si tout est
   *  à 0, la lettre sortirait sans aucun tarif : on le signale. */
  honoraires?: Array<number | null | undefined>;
}): string[] {
  const miss: string[] = [];
  const empty = (v: string | null | undefined) => !v || !String(v).trim();
  if (empty(c.denomination)) miss.push("Nom du dossier");
  if (empty(c.adresse)) miss.push("Adresse");
  if (empty(c.codePostal)) miss.push("Code postal");
  if (empty(c.ville)) miss.push("Ville");
  if (empty(c.activite)) miss.push("Activité");
  if (c.moisCloture == null) miss.push("Mois de clôture");
  if (empty(c.finMission)) miss.push("1ère clôture ensemble");
  if (empty(c.civilite)) miss.push("Civilité dirigeant");
  if (empty(c.nom)) miss.push("Nom dirigeant");
  if (empty(c.prenom)) miss.push("Prénom dirigeant");
  if (c.honoraires && !c.honoraires.some((h) => (h ?? 0) > 0)) {
    miss.push("Honoraires");
  }
  return miss;
}

/** Montants à passer à `missingLdmFields` depuis une fiche client. */
export function honorairesOf(client: {
  honoraires_compta?: number | null;
  forfait_bilan?: number | null;
  honoraires_jur?: number | null;
  tdb_honos_periode?: number | null;
  oss_honos_trimestre?: number | null;
  honoraires_creation?: number | null;
  honoraires_reprise?: number | null;
}): Array<number | null | undefined> {
  return [
    client.honoraires_compta,
    client.forfait_bilan,
    client.honoraires_jur,
    client.tdb_honos_periode,
    client.oss_honos_trimestre,
    client.honoraires_creation,
    client.honoraires_reprise,
  ];
}

export default function LdmChecklist(props: {
  denomination: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  activite: string | null;
  moisCloture: number | null;
  finMission: string | null;
  civilite: string | null;
  prenom: string | null;
  nom: string | null;
  honoraires?: Array<number | null | undefined>;
}) {
  const missing = missingLdmFields(props);
  const honosManquants = missing.includes("Honoraires");

  if (missing.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Dossier complet, la lettre de mission peut être générée.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
            LDM incomplète, {missing.length} champ{missing.length > 1 ? "s" : ""} à renseigner
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {missing.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 rounded text-[11px] bg-white/70 dark:bg-white/[0.08] border border-amber-200 dark:border-amber-500/25 text-amber-900 dark:text-amber-200"
              >
                {m}
              </span>
            ))}
          </div>
          {honosManquants && (
            <div className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">
              Aucun honoraire renseigné : la lettre sortirait sans tarif.{" "}
              <span className="font-medium">Renseigne-les dans l&apos;onglet Honoraires.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
