/**
 * Brouillon du mail de reprise adressé au CONFRÈRE sortant, préparé en même
 * temps que la lettre de reprise déontologique (bouton « Générer LDM » →
 * « Reprise (confrère) »).
 *
 * Le texte ci-dessous est le modèle de cabinet : il est calculé à partir des
 * champs déjà saisis pour la lettre (interlocuteur, expert, dates, clôture),
 * puis présenté DANS LA MODALE où il reste entièrement modifiable avant
 * téléchargement du .eml. Les exercices demandés (N, N-1, N-2) se déduisent de
 * la date de clôture de l'exercice repris.
 */

export type RepriseMailInput = {
  /** Dénomination du dossier repris. */
  denomination: string;
  /** "Confrère" | "Consœur" — pilote le Monsieur / Madame d'ouverture. */
  interlocuteur: "Confrère" | "Consœur";
  /** Nom saisi de l'expert-comptable sortant, ex. "Paul DURAND". */
  expert: string;
  /** Clôture de l'exercice repris (ISO YYYY-MM-DD). */
  cloture: string;
  /** Début de la mission MOON (ISO). */
  dateDebut: string;
  /** Reprise effective des travaux (ISO). */
  dateReprise: string;
  /** Personne à qui le confrère doit envoyer les pièces ("Prénom NOM"). */
  destinatairePieces: string;
};

/** ISO YYYY-MM-DD -> JJ/MM/AAAA. Renvoie la valeur telle quelle si non ISO. */
function fr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Année d'une date ISO, ou null. */
function annee(iso: string): number | null {
  const m = iso.match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

/**
 * Nom de famille de l'expert : les tokens en MAJUSCULES si l'annuaire a
 * pré-rempli "Prénom NOM", sinon le dernier mot saisi. On veut « Monsieur
 * DURAND », pas « Monsieur Paul DURAND ».
 */
export function nomDeFamille(expert: string): string {
  const tokens = expert.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const majuscules = tokens.filter((t) => t.length > 1 && t === t.toLocaleUpperCase("fr-FR"));
  return majuscules.length > 0 ? majuscules.join(" ") : tokens[tokens.length - 1];
}

export function buildRepriseMail(input: RepriseMailInput): { subject: string; body: string } {
  const civilite = input.interlocuteur === "Consœur" ? "Madame" : "Monsieur";
  const nom = nomDeFamille(input.expert);
  const appel = [civilite, nom].filter(Boolean).join(" ");

  const clotureFr = fr(input.cloture);
  const n = annee(input.cloture);
  // Exercices demandés : N (celui repris), N-1, N-2. Sans clôture valide on
  // laisse les repères N/N-1/N-2, à compléter à la main.
  const exercices = n ? `${n}, ${n - 1}, ${n - 2}` : "N, N-1, N-2";
  const exerciceN = n ? String(n) : "N";

  const subject = `Lettre de reprise — ${input.denomination}`;

  const body = `Bonjour ${appel},

Je vous prie de trouver en pièce jointe ma lettre de reprise concernant le dossier ${input.denomination}.

Si rien ne s'oppose à notre entrée sur le dossier, les travaux du cabinet MOON Expertise démarreront au ${fr(input.dateDebut)} avec une date de reprise des travaux au ${fr(input.dateReprise)}.

Je vous prie aussi, dès que possible, de bien vouloir transmettre à ${input.destinatairePieces} les éléments suivants :

- Plaquette (Comptes annuels + Liasse fiscale) des comptes ${exercices} ;
- FEC définitifs des exercices N-2, N-1, N (${exerciceN}) et provisoire N+1 ;
- Dossier de travail complet (si possible) au ${clotureFr} ;
- Liste exhaustive des immobilisations au ${clotureFr} ;
- État des dotations et amortissements au ${clotureFr}.

Je vais également vous adresser une demande de transfert de dossier via Pennylane une fois vos travaux terminés.

En vous remerciant pour votre collaboration,

Respectueusement,`;

  return { subject, body };
}
