/**
 * Modèles d'e-mails par défaut (envoi du guide après acceptation de la PC).
 *
 * Source de repli : si la table email_templates est vide / non migrée, on
 * utilise ces textes. La page /parametrage/emails permet de les éditer ; les
 * valeurs en base ont alors priorité.
 *
 * Placeholders substitués à l'envoi :
 *   {lien}         → URL du guide Gamma (création ou reprise)
 *   {denomination} → nom du dossier
 */

export type EmailTemplate = { subject: string; body: string };
export type EmailTemplateKey = "guide_creation" | "guide_reprise" | "mail_reprise";

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  /**
   * Mail au CONFRÈRE sortant, ouvert dans Outlook au moment de générer la
   * lettre de reprise déontologique. Ses variables sont propres à la reprise
   * (dates de mission, exercices demandés) : cf. REPRISE_VARIABLES dans
   * lib/reprise-mail.ts.
   */
  mail_reprise: {
    subject: "{denomination} - Reprise déontologique",
    body: `Bonjour {civilite_confrere} {nom_expert},

Je vous prie de trouver en pièce jointe ma lettre de reprise concernant le dossier {denomination}.

Si rien ne s'oppose à notre entrée sur le dossier, les travaux du cabinet MOON Expertise démarreront au {date_debut} avec une date de reprise des travaux au {date_reprise}.

Je vous prie aussi, dès que possible, de bien vouloir transmettre à {destinataire_pieces} les éléments suivants :

• Plaquette (Comptes annuels + Liasse fiscale) des comptes {exercices} ;
• FEC définitifs des exercices N-2, N-1, N ({exercice_n}) et provisoire N+1 ;
• Dossier de travail complet (si possible) au {cloture} ;
• Liste exhaustive des immobilisations au {cloture} ;
• État des dotations et amortissements au {cloture}.

Je vais également vous adresser une demande de transfert de dossier via Pennylane une fois vos travaux terminés.

En vous remerciant pour votre collaboration,

Respectueusement,`,
  },
  guide_creation: {
    subject: "Votre guide de création — MOON Expertise",
    body: `Bonjour,

Pour donner suite à votre acceptation de notre proposition commerciale, nous vous invitons à consulter notre guide de création, accessible via le lien ci-dessous. Celui-ci vous accompagnera tout au long des prochaines étapes de la création de votre entreprise.

{lien}

Depuis la première diapositive, vous pourrez accéder à un formulaire en cliquant sur le bouton prévu à cet effet. Nous vous remercions de bien vouloir le compléter et nous transmettre l’ensemble des informations et documents demandés. Ces éléments nous permettront de préparer votre lettre de mission, qui formalise notre collaboration, et d’engager les démarches nécessaires à la constitution de votre entreprise.

Nous vous souhaitons une bonne réception de ces éléments et restons à votre disposition pour toute précision complémentaire.

Respectueusement,`,
  },
  guide_reprise: {
    subject: "Votre guide de reprise — MOON Expertise",
    body: `Bonjour,

Pour donner suite à votre acceptation de notre proposition commerciale, nous vous invitons à consulter notre guide de reprise, accessible via le lien ci-dessous. Celui-ci vous accompagnera tout au long des prochaines étapes de la reprise de votre entreprise par MOON Expertise.

{lien}

Depuis la première diapositive, vous pourrez accéder à un formulaire en cliquant sur le bouton prévu à cet effet. Nous vous remercions de bien vouloir le compléter et nous transmettre l’ensemble des informations et documents demandés. Ces éléments nous permettront de préparer votre lettre de mission, qui formalise notre collaboration, et d’engager les démarches nécessaires à la reprise de votre dossier.

Nous vous souhaitons une bonne réception de ces éléments et restons à votre disposition pour toute précision complémentaire.

Respectueusement,`,
  },
};
