"use client";

import { Mail } from "lucide-react";

/**
 * Bouton "Envoyer présentation" : ouvre un mailto pré-rempli avec la Gamma
 * (présentation MOON) qui contient le lien Tally en page 2. La Gamma envoyée
 * dépend de l'origine :
 *   - Création / Création par Tiers → Gamma CRÉATION
 *   - autre                         → Gamma REPRISE
 *
 * Le formulaire Tally embarqué dans la Gamma est statique. L'identification
 * du dossier post-remplissage se fait côté webhook via SIREN (Reprise) ou
 * email (Création) - pas de client_id puisque la Gamma n'est pas personnalisée
 * par prospect.
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
        Envoyer présentation
      </button>
    );
  }

  function onClick() {
    const subject = `Présentation MOON Expertise · ${denomination}`;
    const body = [
      "Bonjour,",
      "",
      "Suite à notre rencontre, voici la présentation de notre cabinet ainsi qu'un formulaire à compléter en page 2, qui nous permettra de préparer votre proposition commerciale :",
      "",
      gammaUrl,
      "",
      "À votre disposition pour toute question.",
      "",
      "Cordialement,",
      "Benjamin Perez · MOON Expertise",
    ].join("\n");

    const mailto = `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  return (
    <button
      onClick={onClick}
      title={`Envoie la présentation ${isCreation ? "Création" : "Reprise"} par mail`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-zinc-300 text-zinc-700 text-xs font-medium hover:bg-zinc-50 hover:border-zinc-400 transition shadow-sm"
    >
      <Mail className="h-3.5 w-3.5" />
      Envoyer présentation {isCreation ? "(création)" : "(reprise)"}
    </button>
  );
}
