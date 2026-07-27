"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Save,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  MailPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/app/_components/confirm-modal";
import { EmptyState } from "@/app/_components/ui";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import {
  MAIL_VARIABLES,
  buildMailVars,
  fillTemplate,
  variablesNonResolues,
  type MailClientRow,
  type MailDirigeant,
  type MailTemplate,
} from "@/lib/mail-templates";
import {
  createMailTemplate,
  deleteMailTemplate,
  duplicateMailTemplate,
  moveMailTemplate,
  toggleMailTemplate,
  updateMailTemplate,
} from "./actions";

/** Dossier servant d'exemple dans l'aperçu (chargé côté serveur). */
export type ApercuClient = MailClientRow & {
  id: string;
  dirigeant: MailDirigeant;
};

const VIDE = { nom: "", categorie: "", objet: "", corps: "" };

export default function MailTemplatesManager({
  templates,
  clients,
  userEmail,
  peutEditer,
}: {
  templates: MailTemplate[];
  clients: ApercuClient[];
  userEmail: string | null;
  peutEditer: boolean;
}) {
  const [edite, setEdite] = useState<string | "nouveau" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Mes modèles</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Disponibles depuis le bouton « Générer mail » d&apos;une fiche client, et en masse
            depuis la page Documents.
          </p>
        </div>
        {peutEditer && (
          <button
            type="button"
            onClick={() => setEdite("nouveau")}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-gold text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <Plus className="h-3.5 w-3.5" /> Nouveau modèle
          </button>
        )}
      </div>

      {edite === "nouveau" && (
        <Editeur
          initial={VIDE}
          clients={clients}
          userEmail={userEmail}
          onClose={() => setEdite(null)}
        />
      )}

      {templates.length === 0 && edite !== "nouveau" ? (
        <EmptyState
          icon={<MailPlus />}
          title="Aucun modèle de mail"
          description="Crée ton premier modèle : relance de pièces, envoi du bilan, prise de rendez-vous…"
        />
      ) : (
        <ul className="space-y-2">
          {templates.map((t, i) => (
            <li key={t.id}>
              <Ligne
                template={t}
                premier={i === 0}
                dernier={i === templates.length - 1}
                ouvert={edite === t.id}
                peutEditer={peutEditer}
                clients={clients}
                userEmail={userEmail}
                onToggleEdit={() => setEdite(edite === t.id ? null : t.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ligne({
  template,
  premier,
  dernier,
  ouvert,
  peutEditer,
  clients,
  userEmail,
  onToggleEdit,
}: {
  template: MailTemplate;
  premier: boolean;
  dernier: boolean;
  ouvert: boolean;
  peutEditer: boolean;
  clients: ApercuClient[];
  userEmail: string | null;
  onToggleEdit: () => void;
}) {
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  function lance(action: () => Promise<{ ok: boolean; error?: string }>, succes: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return toastError(res.error ?? "Action impossible.");
      toastSuccess(succes);
      router.refresh();
    });
  }

  async function supprimer() {
    const ok = await confirm({
      title: `Supprimer « ${template.nom} » ?`,
      description: "Le modèle disparaîtra du menu « Générer mail ». Action irréversible.",
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (ok) lance(() => deleteMailTemplate(template.id), "Modèle supprimé");
  }

  const boutonIcone =
    "p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden transition-colors",
        template.actif
          ? "border-zinc-200/70 dark:border-white/[0.08]"
          : "border-dashed border-zinc-300 dark:border-white/[0.12] opacity-70"
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={onToggleEdit}
          className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-md"
          aria-expanded={ouvert}
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {template.nom}
            </span>
            {template.categorie && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400">
                {template.categorie}
              </span>
            )}
            {!template.actif && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400">
                Masqué
              </span>
            )}
          </span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            {template.objet}
          </span>
        </button>

        {peutEditer && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              disabled={premier || isPending}
              onClick={() => lance(() => moveMailTemplate(template.id, -1), "Ordre mis à jour")}
              className={boutonIcone}
              aria-label="Monter"
              title="Monter"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={dernier || isPending}
              onClick={() => lance(() => moveMailTemplate(template.id, 1), "Ordre mis à jour")}
              className={boutonIcone}
              aria-label="Descendre"
              title="Descendre"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                lance(
                  () => toggleMailTemplate(template.id, !template.actif),
                  template.actif ? "Modèle masqué" : "Modèle affiché"
                )
              }
              className={boutonIcone}
              aria-label={template.actif ? "Masquer du menu" : "Afficher dans le menu"}
              title={template.actif ? "Masquer du menu" : "Afficher dans le menu"}
            >
              {template.actif ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => lance(() => duplicateMailTemplate(template.id), "Modèle dupliqué")}
              className={boutonIcone}
              aria-label="Dupliquer"
              title="Dupliquer"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={supprimer}
              className={cn(boutonIcone, "hover:text-rose-600 dark:hover:text-rose-400")}
              aria-label="Supprimer"
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {ouvert && (
        <div className="border-t border-zinc-100 dark:border-white/[0.06]">
          <Editeur
            id={template.id}
            initial={{
              nom: template.nom,
              categorie: template.categorie ?? "",
              objet: template.objet,
              corps: template.corps,
            }}
            clients={clients}
            userEmail={userEmail}
            lectureSeule={!peutEditer}
            onClose={onToggleEdit}
          />
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}

function Editeur({
  id,
  initial,
  clients,
  userEmail,
  lectureSeule = false,
  onClose,
}: {
  id?: string;
  initial: { nom: string; categorie: string; objet: string; corps: string };
  clients: ApercuClient[];
  userEmail: string | null;
  lectureSeule?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [nom, setNom] = useState(initial.nom);
  const [categorie, setCategorie] = useState(initial.categorie);
  const [objet, setObjet] = useState(initial.objet);
  const [corps, setCorps] = useState(initial.corps);
  const [apercuId, setApercuId] = useState(clients[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  const objetRef = useRef<HTMLInputElement>(null);
  const corpsRef = useRef<HTMLTextAreaElement>(null);
  // Champ où insérer la variable au clic sur une puce : le dernier utilisé.
  const dernierChamp = useRef<"objet" | "corps">("corps");

  const dirty =
    nom !== initial.nom ||
    categorie !== initial.categorie ||
    objet !== initial.objet ||
    corps !== initial.corps;

  const clientApercu = clients.find((c) => c.id === apercuId) ?? clients[0] ?? null;

  const apercu = useMemo(() => {
    if (!clientApercu) return null;
    const vars = buildMailVars(clientApercu, clientApercu.dirigeant, userEmail);
    return {
      vars,
      objet: fillTemplate(objet, vars),
      corps: fillTemplate(corps, vars),
      manquantes: [
        ...new Set([...variablesNonResolues(objet, vars), ...variablesNonResolues(corps, vars)]),
      ],
    };
  }, [clientApercu, objet, corps, userEmail]);

  /** Insère {cle} à la position du curseur du dernier champ touché. */
  function insere(cle: string) {
    const jeton = `{${cle}}`;
    if (dernierChamp.current === "objet") {
      const el = objetRef.current;
      if (!el) return;
      const d = el.selectionStart ?? objet.length;
      const f = el.selectionEnd ?? d;
      setObjet(objet.slice(0, d) + jeton + objet.slice(f));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(d + jeton.length, d + jeton.length);
      });
    } else {
      const el = corpsRef.current;
      if (!el) return;
      const d = el.selectionStart ?? corps.length;
      const f = el.selectionEnd ?? d;
      setCorps(corps.slice(0, d) + jeton + corps.slice(f));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(d + jeton.length, d + jeton.length);
      });
    }
  }

  function enregistrer() {
    startTransition(async () => {
      const payload = { nom, categorie: categorie || null, objet, corps };
      const res = id ? await updateMailTemplate(id, payload) : await createMailTemplate(payload);
      if (!res.ok) return toastError(res.error ?? "Enregistrement impossible.");
      toastSuccess(id ? "Modèle enregistré" : "Modèle créé");
      router.refresh();
      if (!id) onClose();
    });
  }

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-60";
  const labelCls =
    "block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1";

  const groupes = ["Dossier", "Dirigeant", "Contexte"] as const;

  return (
    <div className="p-4 space-y-4 bg-zinc-50/40 dark:bg-white/[0.015]">
      {!id && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nouveau modèle</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Nom du modèle</span>
          <input
            type="text"
            value={nom}
            disabled={lectureSeule}
            onChange={(e) => setNom(e.target.value)}
            placeholder="ex. Relance pièces manquantes"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Catégorie (facultatif)</span>
          <input
            type="text"
            value={categorie}
            disabled={lectureSeule}
            onChange={(e) => setCategorie(e.target.value)}
            placeholder="ex. Relances"
            className={inputCls}
          />
        </label>
      </div>

      <label className="block">
        <span className={labelCls}>Objet</span>
        <input
          ref={objetRef}
          type="text"
          value={objet}
          disabled={lectureSeule}
          onFocus={() => (dernierChamp.current = "objet")}
          onChange={(e) => setObjet(e.target.value)}
          placeholder="ex. {denomination} — pièces manquantes pour le bilan {annee}"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className={labelCls}>Corps du message</span>
        <textarea
          ref={corpsRef}
          value={corps}
          disabled={lectureSeule}
          rows={12}
          onFocus={() => (dernierChamp.current = "corps")}
          onChange={(e) => setCorps(e.target.value)}
          placeholder={"Bonjour {salutation},\n\n…\n\nRespectueusement,\n{mon_prenom} {mon_nom}"}
          className={cn(inputCls, "leading-relaxed resize-y")}
        />
      </label>

      {!lectureSeule && (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-3">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">
            Clique une variable pour l&apos;insérer dans le champ où tu écrivais.
          </p>
          <div className="space-y-2">
            {groupes.map((g) => (
              <div key={g} className="flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 w-16 shrink-0 pt-1">
                  {g}
                </span>
                <div className="flex flex-wrap gap-1">
                  {MAIL_VARIABLES.filter((v) => v.groupe === g).map((v) => (
                    <button
                      key={v.cle}
                      type="button"
                      onClick={() => insere(v.cle)}
                      title={v.libelle}
                      className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-white/[0.10] bg-zinc-50 dark:bg-white/[0.04] text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:border-[hsl(var(--gold))] hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    >
                      {`{${v.cle}}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aperçu sur un vrai dossier : on voit le mail tel qu'il partira. */}
      {clients.length > 0 && apercu && clientApercu && (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02]">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Aperçu sur
            </span>
            <select
              value={apercuId}
              onChange={(e) => setApercuId(e.target.value)}
              className="h-7 px-2 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-[12px] text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              aria-label="Dossier d'aperçu"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.denomination}
                </option>
              ))}
            </select>
            {apercu.manquantes.length > 0 && (
              <span className="ml-auto text-[11px] text-amber-700 dark:text-amber-300">
                {apercu.manquantes.length} variable{apercu.manquantes.length > 1 ? "s" : ""} vide
                {apercu.manquantes.length > 1 ? "s" : ""} sur ce dossier
              </span>
            )}
          </div>
          <div className="p-3 space-y-2">
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              <Surligne texte={apercu.objet} brut={objet} vars={apercu.vars} />
            </p>
            <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              <Surligne texte={apercu.corps} brut={corps} vars={apercu.vars} />
            </p>
          </div>
        </div>
      )}

      {!lectureSeule && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            {id ? "Fermer" : "Annuler"}
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={isPending || !dirty || !nom.trim() || !objet.trim() || !corps.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-gold text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <Save className="h-3.5 w-3.5" /> {id ? "Enregistrer" : "Créer le modèle"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Rend le texte substitué en soulignant en ambre les variables qui sortiraient
 * VIDES sur le dossier d'aperçu — on repère le « Bonjour , » avant l'envoi.
 */
function Surligne({
  texte,
  brut,
  vars,
}: {
  texte: string;
  brut: string;
  vars: Record<string, string>;
}) {
  const manquantes = new Set(variablesNonResolues(brut, vars));
  if (manquantes.size === 0) return <>{texte || "—"}</>;

  // On re-parcourt le texte BRUT pour situer les trous, en substituant au vol.
  const morceaux = brut.split(/(\{[a-z_]+\})/g);
  return (
    <>
      {morceaux.map((m, i) => {
        if (!/^\{[a-z_]+\}$/.test(m)) return <span key={i}>{m}</span>;
        if (manquantes.has(m)) {
          return (
            <span
              key={i}
              className="px-1 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 font-mono text-[11px]"
              title="Cette information est absente du dossier"
            >
              {m}
            </span>
          );
        }
        return <span key={i}>{fillTemplate(m, vars)}</span>;
      })}
    </>
  );
}
