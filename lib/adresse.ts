/**
 * Utilitaires d'adresse pour le préremplissage depuis l'annuaire-entreprises.
 *
 * L'API `recherche-entreprises.api.gouv.fr` renvoie `siege.adresse` qui
 * contient TOUTE l'adresse concaténée, ex. :
 *   "122 RUE JEAN DE LA FONTAINE 75016 PARIS"
 *
 * Pour le champ "Adresse ligne 1" du CRM, on ne veut QUE la rue (le code
 * postal et la ville ont leurs propres champs). On enlève donc le CP et la
 * ville de la chaîne.
 *
 * Source unique de vérité : utilisée à la fois à la création d'un dossier
 * (app/clients/nouveau/form.tsx) ET au rechargement depuis l'annuaire sur la
 * fiche (app/clients/[slug]/annuaire-button.tsx), pour éviter toute divergence.
 */
export function extractRueOnly(
  adresseComplete: string,
  codePostal: string | null,
  ville: string | null
): string {
  let s = adresseComplete;
  if (codePostal) {
    s = s.replace(new RegExp("\\s*" + codePostal + "\\s*", "g"), " ");
  }
  if (ville) {
    s = s.replace(new RegExp("\\s*" + ville + "\\s*", "gi"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}
