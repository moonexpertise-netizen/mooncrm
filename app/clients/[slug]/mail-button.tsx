"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MailPlus, ChevronDown, Loader2, AlertTriangle, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormModal } from "@/app/_components/form-modal";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import {
  buildMailVars,
  fillTemplate,
  variablesNonResolues,
  type MailClientRow,
  type MailDirigeant,
  type MailTemplate,
} from "@/lib/mail-templates";

/**
 * Bouton « Générer mail » (3e bouton de la fiche, après LDM et attestation).
 *
 * Menu des modèles actifs (/parametrage/emails) -> modale d'aperçu où tout est
 * relisible et modifiable -> génération d'un .eml téléchargé, qu'un double-clic
 * ouvre dans Outlook comme brouillon prêt à partir.
 *
 * L'aperçu affiche exactement ce qui sera généré : la substitution des
 * variables se fait ici, et c'est ce texte-là qui part vers l'API (aucune
 * seconde substitution serveur qui pourrait diverger).
 */
export default function MailButton({
  clientId,
  client,
  dirigeant,
  templates,
  userEmail,
}: {
  clientId: string;
  client: MailClientRow;
  dirigeant: MailDirigeant;
  templates: MailTemplate[];
  userEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [choisi, setChoisi] = useState<MailTemplate | null>(null);

  // Modèles groupés par catégorie, dans l'ordre défini au paramétrage.
  const groupes = useMemo(() => {
    const map = new Map<string, MailTemplate[]>();
    for (const t of templates) {
      const cle = t.categorie?.trim() || "Sans catégorie";
      const liste = map.get(cle);
      if (liste) liste.push(t);
      else map.set(cle, [t]);
    }
    return [...map.entries()];
  }, [templates]);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        <MailPlus className="h-3.5 w-3.5" />
        Générer mail
        <ChevronDown className="h-3 w-3 opacity-80" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-[hsl(var(--card))] shadow-xl animate-slide-up-fade"
        >
          {templates.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300">Aucun modèle de mail.</p>
              <Link
                href="/parametrage/emails"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] hover:underline"
              >
                <Settings2 className="h-3 w-3" />
                Créer un modèle
              </Link>
            </div>
          ) : (
            <>
              {groupes.map(([categorie, liste]) => (
                <div key={categorie}>
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 bg-zinc-50/60 dark:bg-white/[0.03] border-b dark:border-white/[0.06]">
                    {categorie}
                  </div>
                  {liste.map((t) => (
                    <button
                      key={t.id}
                      role="menuitem"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setOpen(false);
                        setChoisi(t);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:bg-[hsl(var(--gold))]/10"
                    >
                      <MailPlus className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="flex-1 truncate">{t.nom}</span>
                    </button>
                  ))}
                </div>
              ))}
              <Link
                href="/parametrage/emails"
                className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-zinc-500 dark:text-zinc-400 border-t dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                Gérer les modèles
              </Link>
            </>
          )}
        </div>
      )}

      {choisi && (
        <MailDialog
          clientId={clientId}
          client={client}
          dirigeant={dirigeant}
          template={choisi}
          userEmail={userEmail}
          onClose={() => setChoisi(null)}
        />
      )}
    </div>
  );
}

function MailDialog({
  clientId,
  client,
  dirigeant,
  template,
  userEmail,
  onClose,
}: {
  clientId: string;
  client: MailClientRow;
  dirigeant: MailDirigeant;
  template: MailTemplate;
  userEmail: string | null;
  onClose: () => void;
}) {
  // Substitution au montage de la modale (donc après hydratation : pas de
  // divergence serveur/client sur {date_du_jour}).
  const initial = useMemo(() => {
    const vars = buildMailVars(client, dirigeant, userEmail);
    return {
      objet: fillTemplate(template.objet, vars),
      corps: fillTemplate(template.corps, vars),
      manquantes: [
        ...new Set([
          ...variablesNonResolues(template.objet, vars),
          ...variablesNonResolues(template.corps, vars),
        ]),
      ],
    };
  }, [client, dirigeant, template, userEmail]);

  const [to, setTo] = useState(dirigeant?.email ?? client.email ?? "");
  const [objet, setObjet] = useState(initial.objet);
  const [corps, setCorps] = useState(initial.corps);
  const [busy, setBusy] = useState(false);

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  const labelCls = "text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block";

  async function generer() {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: objet, body: corps, nomModele: template.nom }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      a.download = cd.match(/filename="([^"]+)"/)?.[1] ?? "mail.eml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastSuccess("Mail généré — ouvre le fichier pour le retrouver dans Outlook");
      onClose();
    } catch (e) {
      toastError(e, "Échec de la génération du mail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      title={`Générer un mail — ${template.nom}`}
      onClose={onClose}
      onSubmit={generer}
      submitLabel={busy ? "Génération…" : "Ouvrir dans Outlook"}
      submitDisabled={busy || !objet.trim() || !corps.trim()}
      isPending={busy}
      size="lg"
    >
      <div className="space-y-3.5">
        {initial.manquantes.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Information{initial.manquantes.length > 1 ? "s" : ""} absente
              {initial.manquantes.length > 1 ? "s" : ""} du dossier :{" "}
              <span className="font-medium">{initial.manquantes.join(", ")}</span>. Complète le
              texte à la main avant d&apos;envoyer.
            </span>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="mail-to">
            Destinataire
          </label>
          <input
            id="mail-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="aucune adresse au dossier"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="mail-objet">
            Objet
          </label>
          <input
            id="mail-objet"
            type="text"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="mail-corps">
            Message
          </label>
          <textarea
            id="mail-corps"
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            rows={14}
            className={cn(inputCls, "leading-relaxed resize-y")}
          />
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Un fichier .eml est téléchargé : double-clic pour l&apos;ouvrir dans Outlook en brouillon,
          où tu ajoutes ta signature et tes pièces jointes avant d&apos;envoyer.
        </p>
      </div>
    </FormModal>
  );
}
