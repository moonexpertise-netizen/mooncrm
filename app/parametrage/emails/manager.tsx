"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertTriangle } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import type { EmailTemplate, EmailTemplateKey } from "@/lib/email-templates-defaults";
import { REPRISE_VARIABLES, MAILTO_LIMITE, longueurMailto } from "@/lib/reprise-mail";
import { setEmailTemplate } from "./actions";

/** Variables documentées sous chaque éditeur système. */
const VARIABLES_GUIDE = [
  { cle: "lien", libelle: "Lien du guide Gamma" },
  { cle: "denomination", libelle: "Nom du dossier" },
];

export default function EmailsManager({
  creation,
  reprise,
  mailReprise,
}: {
  creation: EmailTemplate;
  reprise: EmailTemplate;
  mailReprise: EmailTemplate;
}) {
  return (
    <div className="space-y-5">
      <TemplateEditor
        titre="Guide création"
        sousTitre="Bouton « Envoyer le guide » sur un dossier d'origine Création."
        tplKey="guide_creation"
        initial={creation}
        variables={VARIABLES_GUIDE}
      />
      <TemplateEditor
        titre="Guide reprise"
        sousTitre="Bouton « Envoyer le guide » sur les autres dossiers."
        tplKey="guide_reprise"
        initial={reprise}
        variables={VARIABLES_GUIDE}
      />
      <TemplateEditor
        titre="Mail de reprise déontologique"
        sousTitre="Brouillon Outlook ouvert au moment de générer la lettre de reprise au confrère."
        tplKey="mail_reprise"
        initial={mailReprise}
        variables={REPRISE_VARIABLES}
        alerteMailto
      />
    </div>
  );
}

function TemplateEditor({
  titre,
  sousTitre,
  tplKey,
  initial,
  variables,
  alerteMailto = false,
}: {
  titre: string;
  sousTitre: string;
  tplKey: EmailTemplateKey;
  initial: EmailTemplate;
  variables: { cle: string; libelle: string }[];
  /** Surveille la longueur : un mailto est tronqué au-delà de ~2000 caractères. */
  alerteMailto?: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [isPending, startTransition] = useTransition();

  const dirty = subject !== initial.subject || body !== initial.body;
  const longueur = alerteMailto ? longueurMailto(subject, body) : 0;
  const tropLong = alerteMailto && longueur > MAILTO_LIMITE;

  function save() {
    startTransition(async () => {
      const res = await setEmailTemplate(tplKey, subject, body);
      if (!res.ok) {
        toastError(res.error ?? "Enregistrement impossible.");
        return;
      }
      toastSuccess(`Modèle « ${titre} » enregistré`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{titre}</h3>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{sousTitre}</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-gold text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          <Save className="h-3.5 w-3.5" /> Enregistrer
        </button>
      </div>

      <div className="p-4 space-y-3">
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Objet</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 w-full px-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Corps du message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={13}
            className="w-full px-2.5 py-2 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] leading-relaxed resize-y"
          />
        </label>

        {/* Variables du modèle */}
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] px-3 py-2.5">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5">
            Variables remplacées automatiquement :
          </p>
          <div className="flex flex-wrap gap-1">
            {variables.map((v) => (
              <span
                key={v.cle}
                title={v.libelle}
                className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-[11px] font-mono text-zinc-600 dark:text-zinc-300"
              >
                {`{${v.cle}}`}
              </span>
            ))}
          </div>
        </div>

        {/* Garde-fou longueur : Outlook tronque un mailto trop long. */}
        {alerteMailto && (
          <div
            className={
              tropLong
                ? "flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200"
                : "text-[11px] text-zinc-500 dark:text-zinc-400"
            }
          >
            {tropLong ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Modèle trop long ({longueur} caractères une fois encodé, limite {MAILTO_LIMITE}).
                  Outlook couperait la fin du message. Raccourcis le texte.
                </span>
              </>
            ) : (
              <span>
                Longueur encodée : {longueur} / {MAILTO_LIMITE} caractères. Au-delà, Outlook
                tronquerait le message.
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
