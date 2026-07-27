import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth";
import { PageHeader } from "@/app/_components/page-header";
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplateKey } from "@/lib/email-templates-defaults";
import { MAIL_CLIENT_SELECT, type MailTemplate } from "@/lib/mail-templates";
import EmailsManager from "./manager";
import MailTemplatesManager, { type ApercuClient } from "./mail-templates-manager";

export const dynamic = "force-dynamic";

/** Nombre de dossiers proposés dans le sélecteur d'aperçu de l'éditeur. */
const NB_DOSSIERS_APERCU = 40;

export default async function EmailsParametragePage() {
  const sb = await createClient();

  const [
    { data },
    { data: mailTplRows },
    { data: clientsRows },
    { data: authData },
    peutEditer,
  ] = await Promise.all([
    sb.from("email_templates").select("key, subject, body"),
    sb
      .from("mail_templates")
      .select("id, nom, categorie, objet, corps, actif, ordre")
      .order("ordre", { ascending: true })
      .order("nom", { ascending: true }),
    sb.from("clients").select(MAIL_CLIENT_SELECT).order("denomination").limit(NB_DOSSIERS_APERCU),
    sb.auth.getUser(),
    can("edit_parametrage"),
  ]);

  const byKey = new Map(
    ((data ?? []) as { key: string; subject: string; body: string }[]).map((r) => [r.key, r])
  );
  const resolve = (k: EmailTemplateKey) => {
    const r = byKey.get(k);
    return {
      subject: r?.subject ?? DEFAULT_EMAIL_TEMPLATES[k].subject,
      body: r?.body ?? DEFAULT_EMAIL_TEMPLATES[k].body,
    };
  };

  // Dirigeants des dossiers d'aperçu (1er contact rattaché, comme partout).
  const clientIds = ((clientsRows ?? []) as { id: string }[]).map((c) => c.id);
  const { data: linksRaw } = clientIds.length
    ? await sb
        .from("client_contacts")
        .select("client_id, contacts(nom, prenom, civilite, email, telephone)")
        .in("client_id", clientIds)
    : { data: [] as unknown[] };

  const dirByClient = new Map<string, ApercuClient["dirigeant"]>();
  for (const l of (linksRaw ?? []) as unknown as Array<{
    client_id: string;
    contacts: {
      nom: string | null;
      prenom: string | null;
      civilite: string | null;
      email: string | null;
      telephone: string | null;
    } | null;
  }>) {
    if (!dirByClient.has(l.client_id) && l.contacts) dirByClient.set(l.client_id, l.contacts);
  }

  const apercuClients: ApercuClient[] = ((clientsRows ?? []) as unknown as ApercuClient[]).map(
    (c) => ({ ...c, dirigeant: dirByClient.get(c.id) ?? null })
  );

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title="Modèles d'e-mails"
        description="Les modèles système du bouton « Envoyer le guide », et tes modèles libres générables depuis n'importe quelle fiche client."
        actions={
          <Link
            href="/parametrage"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-sm transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Paramétrage
          </Link>
        }
      />

      <MailTemplatesManager
        templates={(mailTplRows ?? []) as MailTemplate[]}
        clients={apercuClients}
        userEmail={authData?.user?.email ?? null}
        peutEditer={peutEditer}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Modèles système
          </h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Les messages rattachés à un bouton précis de l&apos;application : envoi du guide selon
            l&apos;origine du dossier, et mail au confrère lors d&apos;une reprise déontologique.
          </p>
        </div>
        <EmailsManager
          creation={resolve("guide_creation")}
          reprise={resolve("guide_reprise")}
          mailReprise={resolve("mail_reprise")}
        />
      </section>
    </div>
  );
}
