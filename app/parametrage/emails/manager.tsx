"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import type { EmailTemplate, EmailTemplateKey } from "@/lib/email-templates-defaults";
import { setEmailTemplate } from "./actions";

export default function EmailsManager({
  creation,
  reprise,
}: {
  creation: EmailTemplate;
  reprise: EmailTemplate;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
        Variables disponibles :{" "}
        <code className="px-1 py-0.5 rounded bg-white dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/[0.08] text-xs">{"{lien}"}</code>{" "}
        (lien du guide Gamma) et{" "}
        <code className="px-1 py-0.5 rounded bg-white dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/[0.08] text-xs">{"{denomination}"}</code>{" "}
        (nom du dossier). Elles sont remplacées automatiquement à l'envoi.
      </div>
      <TemplateEditor titre="Création" tplKey="guide_creation" initial={creation} />
      <TemplateEditor titre="Reprise" tplKey="guide_reprise" initial={reprise} />
    </div>
  );
}

function TemplateEditor({
  titre,
  tplKey,
  initial,
}: {
  titre: string;
  tplKey: EmailTemplateKey;
  initial: EmailTemplate;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [isPending, startTransition] = useTransition();

  const dirty = subject !== initial.subject || body !== initial.body;

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
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02]">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{titre}</h2>
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-gold text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>
    </section>
  );
}
