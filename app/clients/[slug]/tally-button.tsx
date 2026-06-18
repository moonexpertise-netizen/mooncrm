"use client";

import { Mail } from "lucide-react";

/**
 * Bouton "Envoyer le guide" : ouvre un mailto pré-rempli avec le guide Gamma
 * (création ou reprise) à envoyer après acceptation de la proposition
 * commerciale. Le formulaire à compléter est un BOUTON sur la 1re diapositive
 * du guide (pas de lien Tally séparé dans le mail).
 *
 * Le guide envoyé dépend de l'origine :
 *   - Création / Création par Tiers → guide CRÉATION
 *   - autre                         → guide REPRISE
 *
 * L'identification du dossier post-remplissage se fait côté webhook via SIREN
 * (Reprise) ou email (Création) - le guide n'est pas personnalisé par prospect.
 */
export default function TallyButton({
  email,
  denomination,
  origine,
}: {
  clientId: string; // gardé pour rétrocompat, non utilisé ici
  email: string | null;
  denomination: string;
  siren: string | null;
  origine: string | null;
}) {
  const isCreation =
    origine === "1 - Création" || origine === "2 - Création par Tiers";
  const gammaUrl = isCreation
    ? process.env.NEXT_PUBLIC_GAMMA_URL_CREATION
    : process.env.NEXT_PUBLIC_GAMMA_URL_REPRISE;

  if (!gammaUrl) {
    return (
      <button
        disabled
        title={`Configure NEXT_PUBLIC_GAMMA_URL_${isCreation ? "CREATION" : "REPRISE"} dans .env.local`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-400 text-xs font-medium cursor-not-allowed"
      >
        <Mail className="h-3.5 w-3.5" />
        Envoyer le guide
      </button>
    );
  }

  function onClick() {
    const subject = `Guide de ${isCreation ? "création" : "reprise"} — MOON Expertise (${denomination})`;

    // Intro + dernière démarche varient selon création / reprise.
    const intro = isCreation
      ? "Pour donner suite à votre acceptation de notre proposition commerciale, nous vous invitons à consulter notre guide de création, accessible via le lien ci-dessous. Celui-ci vous accompagnera tout au long des prochaines étapes de la création de votre entreprise."
      : "Pour donner suite à votre acceptation de notre proposition commerciale, nous vous invitons à consulter notre guide de reprise, accessible via le lien ci-dessous. Celui-ci vous accompagnera tout au long des prochaines étapes de la reprise de votre entreprise par MOON Expertise.";
    const demarche = isCreation
      ? "Ces éléments nous permettront de préparer votre lettre de mission, qui formalise notre collaboration, et d’engager les démarches nécessaires à la constitution de votre entreprise."
      : "Ces éléments nous permettront de préparer votre lettre de mission, qui formalise notre collaboration, et d’engager les démarches nécessaires à la reprise de votre dossier.";

    const body = [
      "Bonjour,",
      "",
      intro,
      "",
      gammaUrl,
      "",
      `Depuis la première diapositive, vous pourrez accéder à un formulaire en cliquant sur le bouton prévu à cet effet. Nous vous remercions de bien vouloir le compléter et nous transmettre l’ensemble des informations et documents demandés. ${demarche}`,
      "",
      "Nous vous souhaitons une bonne réception de ces éléments et restons à votre disposition pour toute précision complémentaire.",
      "",
      "Respectueusement,",
      "Benjamin Perez, MOON Expertise",
    ].join("\n");

    const mailto = `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  return (
    <button
      onClick={onClick}
      title={`Envoie le guide ${isCreation ? "création" : "reprise"} par mail`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-zinc-300 text-zinc-700 text-xs font-medium hover:bg-zinc-50 hover:border-zinc-400 transition shadow-sm"
    >
      <Mail className="h-3.5 w-3.5" />
      Envoyer le guide {isCreation ? "(création)" : "(reprise)"}
    </button>
  );
}
