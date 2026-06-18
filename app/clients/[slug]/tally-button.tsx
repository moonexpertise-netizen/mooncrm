"use client";

import { Mail } from "lucide-react";
import {
  DEFAULT_EMAIL_TEMPLATES,
  type EmailTemplate,
} from "@/lib/email-templates-defaults";

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
 * Les textes (objet + corps) sont éditables dans /parametrage/emails et passés
 * via `templates`. Repli sur DEFAULT_EMAIL_TEMPLATES si absents. Placeholders
 * {lien} (URL du guide) et {denomination} substitués à l'envoi.
 */
export default function TallyButton({
  email,
  denomination,
  origine,
  templates,
}: {
  clientId: string; // gardé pour rétrocompat, non utilisé ici
  email: string | null;
  denomination: string;
  siren: string | null;
  origine: string | null;
  templates?: { creation: EmailTemplate | null; reprise: EmailTemplate | null };
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
    const tpl: EmailTemplate = isCreation
      ? templates?.creation ?? DEFAULT_EMAIL_TEMPLATES.guide_creation
      : templates?.reprise ?? DEFAULT_EMAIL_TEMPLATES.guide_reprise;

    // Substitution des variables. gammaUrl est garanti non-null ici.
    const fill = (s: string) =>
      s.replace(/\{lien\}/g, gammaUrl as string).replace(/\{denomination\}/g, denomination);

    const subject = fill(tpl.subject);
    const body = fill(tpl.body);
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
