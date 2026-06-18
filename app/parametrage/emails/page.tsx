import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplateKey } from "@/lib/email-templates-defaults";
import EmailsManager from "./manager";

export const dynamic = "force-dynamic";

export default async function EmailsParametragePage() {
  const sb = await createClient();
  const { data } = await sb.from("email_templates").select("key, subject, body");
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

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Modèles d'e-mails"
        description="Le message envoyé via le bouton « Envoyer le guide » sur une fiche, selon l'origine du dossier (création ou reprise)."
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
      <EmailsManager
        creation={resolve("guide_creation")}
        reprise={resolve("guide_reprise")}
      />
    </div>
  );
}
