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
export type EmailTemplateKey = "guide_creation" | "guide_reprise";

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
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
