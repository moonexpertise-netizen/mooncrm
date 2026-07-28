"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractRueOnly } from "@/lib/adresse";
import { buildRepriseMail, lienMailto } from "@/lib/reprise-mail";
import type { EmailTemplate } from "@/lib/email-templates-defaults";

/**
 * Boîte de dialogue de la lettre de reprise au confrère.
 *
 * Le destinataire est le CABINET sortant (pas le dirigeant). Recherche du
 * cabinet dans l'annuaire public (même API que "Nouveau client") pour
 * pré-remplir nom + adresse + CP + ville, tout restant éditable. Le nom du
 * dossier et sa date de clôture viennent du dossier courant (côté serveur).
 *
 * Si la case est cochée, la génération de la lettre ouvre DANS LA FOULÉE un
 * brouillon Outlook (mailto) adressé au confrère, calculé à partir des mêmes
 * champs — on ne ressaisit ni les dates ni le nom de l'expert. Aucune étape
 * intermédiaire dans l'outil : la relecture se fait dans Outlook. Le texte du
 * modèle est éditable dans /parametrage/emails.
 */

const TYPES_MISSION = [
  { label: "Mission de présentation", value: "de présentation" },
  { label: "Assistance aux obligations déclaratives", value: "d'assistance aux obligations déclaratives" },
];

type Dirigeant = {
  nom?: string | null;
  prenoms?: string | null;
  qualite?: string | null;
  type_dirigeant?: string | null;
};

type Suggestion = {
  siren: string;
  nom_complet: string;
  nom_raison_sociale?: string | null;
  dirigeants?: Dirigeant[];
  siege?: { code_postal?: string | null; libelle_commune?: string | null; adresse?: string | null } | null;
};

function cleanName(s: Suggestion): string {
  const rs = s.nom_raison_sociale?.trim();
  if (rs) return rs;
  const i = s.nom_complet.indexOf(" (");
  return (i === -1 ? s.nom_complet : s.nom_complet.substring(0, i)).trim();
}

/**
 * Rang de priorité d'un dirigeant selon sa qualité, pour la lettre de reprise :
 * Président ou Gérant d'abord, puis Directeur Général, sinon tout le reste.
 * (Plus le rang est bas, plus c'est prioritaire.)
 */
function rangQualite(q: string | null | undefined): number {
  const s = (q ?? "").toLowerCase();
  if (s.includes("président") || s.includes("gérant") || s.includes("gerant")) return 0;
  if (s.includes("directeur général") || s.includes("directeur general")) return 1;
  return 2;
}

/**
 * "Prénom NOM" du dirigeant à retenir : personne physique la mieux placée
 * (Président / Gérant > Directeur Général > autre). "" si aucun.
 */
function dirigeantName(s: Suggestion): string {
  const physiques = (s.dirigeants ?? []).filter((x) => x.type_dirigeant === "personne physique");
  if (!physiques.length) return "";
  // Tri stable par rang de qualité ; le 1er reste 1er à rang égal.
  const d = physiques
    .map((x, i) => ({ x, i, r: rangQualite(x.qualite) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)[0].x;
  const nom = (d.nom ?? "").trim().toUpperCase();
  const prenomBrut = (d.prenoms ?? "").trim().split(/\s+/)[0] ?? "";
  const prenom = prenomBrut
    ? prenomBrut.charAt(0).toUpperCase() + prenomBrut.slice(1).toLowerCase()
    : "";
  return [prenom, nom].filter(Boolean).join(" ");
}

export default function RepriseDialog({
  clientId,
  denomination,
  dirigeant,
  mailTemplate,
  open,
  onClose,
  defaultCloture,
}: {
  clientId: string;
  /** Nom du dossier repris, cité dans le corps du mail. */
  denomination: string;
  /** Dirigeant du dossier : destinataire par défaut des pièces demandées. */
  dirigeant?: { prenom: string | null; nom: string } | null;
  /** Modèle `mail_reprise` paramétré ; null = défaut du code. */
  mailTemplate?: EmailTemplate | null;
  open: boolean;
  onClose: () => void;
  /** fin_mission_date du dossier (ISO), pour pré-remplir la clôture. */
  defaultCloture?: string | null;
}) {
  const [cabinet, setCabinet] = useState("");
  const [expert, setExpert] = useState("");
  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [interlocuteur, setInterlocuteur] = useState<"Confrère" | "Consœur">("Confrère");
  const [typeMission, setTypeMission] = useState(TYPES_MISSION[0].value);
  const [cloture, setCloture] = useState(defaultCloture ?? "");
  const [dateDebut, setDateDebut] = useState("");
  const [dateReprise, setDateReprise] = useState("");

  // --- Mail de reprise au confrère, ouvert directement dans Outlook ---
  const nomDirigeant = [dirigeant?.prenom, dirigeant?.nom].filter(Boolean).join(" ");
  const [preparerMail, setPreparerMail] = useState(true);
  const [emailConfrere, setEmailConfrere] = useState("");
  const [destinatairePieces, setDestinatairePieces] = useState(nomDirigeant);
  // Format de sortie : PDF signé (celui qui part au confrère) ou .docx
  // retouchable dans Word. Les deux portent le bloc de signature.
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");

  // Pré-remplit la clôture avec la date du dossier à l'ouverture.
  useEffect(() => {
    if (open) setCloture(defaultCloture ?? "");
  }, [open, defaultCloture]);

  // Autocomplete annuaire
  const [search, setSearch] = useState("");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La date de reprise suit par défaut la date de début tant qu'elle n'a pas
  // été modifiée manuellement.
  const [repriseTouched, setRepriseTouched] = useState(false);
  useEffect(() => {
    if (!repriseTouched) setDateReprise(dateDebut);
  }, [dateDebut, repriseTouched]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = search.trim();
    if (q.length < 2) {
      setSugs([]);
      setListOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=8`
        );
        if (!r.ok) return;
        const json = (await r.json()) as { results: Suggestion[] };
        setSugs(json.results ?? []);
        setListOpen(true);
      } catch {
        /* silencieux : la saisie manuelle reste possible */
      }
    }, 220);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [search]);

  function pick(s: Suggestion) {
    setCabinet(cleanName(s));
    // Pré-remplit l'expert avec le dirigeant du cabinet (personne physique).
    const dir = dirigeantName(s);
    if (dir) setExpert(dir);
    const cp = s.siege?.code_postal?.trim() || null;
    const v = s.siege?.libelle_commune?.trim() || null;
    if (s.siege?.adresse) setAdresse(extractRueOnly(s.siege.adresse, cp, v));
    if (cp) setCodePostal(cp);
    if (v) setVille(v);
    setSearch("");
    setSugs([]);
    setListOpen(false);
  }

  function toISO(d: string) {
    // <input type="date"> renvoie déjà YYYY-MM-DD ; on transmet tel quel, la
    // route/générateur formate en JJ/MM/AAAA.
    return d;
  }

  function generate() {
    const qs = new URLSearchParams({
      template: "reprise",
      cabinet: cabinet.trim(),
      expert: expert.trim(),
      adresse: adresse.trim(),
      code_postal: codePostal.trim(),
      ville: ville.trim(),
      interlocuteur,
      type_mission: typeMission,
      cloture: frOf(cloture),
      date_debut: frOf(dateDebut),
      date_reprise: frOf(dateReprise),
      format,
    });
    const urlDocx = `/api/clients/${clientId}/ldm?${qs.toString()}`;

    if (!preparerMail) {
      window.location.href = urlDocx;
      onClose();
      return;
    }

    // Deux actions à la suite : on déclenche le téléchargement via un <a> (qui
    // ne quitte pas la page, contrairement à window.location) PUIS le mailto,
    // sinon la seconde navigation annulerait la première.
    const a = document.createElement("a");
    a.href = urlDocx;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();

    const { subject, body } = buildRepriseMail(
      {
        denomination,
        interlocuteur,
        expert: expert.trim(),
        cloture,
        dateDebut,
        dateReprise,
        destinatairePieces: destinatairePieces.trim() || "…",
      },
      mailTemplate ?? null
    );
    const lien = lienMailto(emailConfrere.trim(), subject, body);
    window.setTimeout(() => {
      window.location.href = lien;
    }, 600);
    onClose();
  }

  const valid = cabinet.trim() && expert.trim() && cloture && dateDebut && dateReprise;

  if (!open || typeof document === "undefined") return null;

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";
  const labelCls = "text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block";

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/50 dark:bg-[hsl(226_85%_3%_/_0.6)] backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Lettre de reprise, paramétrage</h3>
          <button type="button" onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 max-h-[65vh] overflow-y-auto">
          {/* Recherche annuaire pour le cabinet sortant */}
          <div className="relative">
            <label className={labelCls}>Rechercher le cabinet <span className="text-zinc-400 font-normal">(annuaire, optionnel)</span></label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom ou SIREN du cabinet sortant"
              className={inputCls}
            />
            {listOpen && sugs.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-[hsl(var(--card))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-xl max-h-56 overflow-auto py-1">
                {sugs.map((s) => (
                  <button
                    key={s.siren}
                    type="button"
                    onClick={() => pick(s)}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="text-sm font-medium truncate">{cleanName(s)}</div>
                    <div className="text-[11px] text-zinc-500">
                      {[s.siege?.code_postal, s.siege?.libelle_commune].filter(Boolean).join(" ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Nom du cabinet comptable</label>
            <input type="text" value={cabinet} onChange={(e) => setCabinet(e.target.value)} className={inputCls} placeholder="ex. CABINET DURAND & ASSOCIÉS" />
          </div>
          <div>
            <label className={labelCls}>Nom de l&apos;expert-comptable</label>
            <input type="text" value={expert} onChange={(e) => setExpert(e.target.value)} className={inputCls} placeholder="ex. Paul DURAND" />
          </div>
          <div>
            <label className={labelCls}>Adresse (ligne 1)</label>
            <input type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Code postal</label>
              <input type="text" value={codePostal} onChange={(e) => setCodePostal(e.target.value.replace(/\D/g, "").slice(0, 5))} className={cn(inputCls, "tabular-nums")} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Ville</label>
              <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Interlocuteur</label>
            <div className="flex gap-1">
              {(["Confrère", "Consœur"] as const).map((it) => (
                <button
                  key={it}
                  type="button"
                  onClick={() => setInterlocuteur(it)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition",
                    interlocuteur === it
                      ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]"
                      : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.10] text-zinc-600 dark:text-zinc-300"
                  )}
                >
                  {it}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Définit le «&nbsp;{interlocuteur === "Consœur" ? "Chère Consœur" : "Cher Confrère"}&nbsp;» d&apos;ouverture et de clôture.
            </p>
          </div>

          <div>
            <label className={labelCls}>Type de mission</label>
            <select value={typeMission} onChange={(e) => setTypeMission(e.target.value)} className={inputCls}>
              {TYPES_MISSION.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Date de clôture de l&apos;exercice repris</label>
            <input type="date" value={cloture} onChange={(e) => setCloture(e.target.value)} className={cn(inputCls, "tabular-nums")} />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              «&nbsp;pour l&apos;exercice se clôturant le …&nbsp;». Pré-rempli avec la clôture du dossier.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Date de début de mission</label>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(toISO(e.target.value))} className={cn(inputCls, "tabular-nums")} />
            </div>
            <div>
              <label className={labelCls}>Date de reprise des travaux</label>
              <input
                type="date"
                value={dateReprise}
                onChange={(e) => { setRepriseTouched(true); setDateReprise(toISO(e.target.value)); }}
                className={cn(inputCls, "tabular-nums")}
              />
            </div>
          </div>

          {/* Format de sortie du courrier. */}
          <div>
            <label className={labelCls}>Format du courrier</label>
            <div className="flex gap-1">
              {(
                [
                  { v: "pdf", label: "PDF signé", aide: "Prêt à envoyer, bloc de signature daté du jour." },
                  { v: "docx", label: "Word (.docx)", aide: "Retouchable dans Word, signature incluse." },
                ] as const
              ).map((f) => (
                <button
                  key={f.v}
                  type="button"
                  onClick={() => setFormat(f.v)}
                  aria-pressed={format === f.v}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition",
                    format === f.v
                      ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]"
                      : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.10] text-zinc-600 dark:text-zinc-300"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              {format === "pdf"
                ? "Prêt à envoyer, avec le bloc de signature daté du jour."
                : "Retouchable dans Word, avec le bloc de signature."}
            </p>
          </div>

          {/* Brouillon de mail au confrère, préparé dans la foulée. */}
          <div className="pt-1 border-t border-zinc-200 dark:border-white/[0.06]">
            <label className="flex items-center gap-2 pt-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preparerMail}
                onChange={(e) => setPreparerMail(e.target.checked)}
                className="accent-[hsl(var(--gold))]"
              />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Ouvrir aussi le brouillon de mail dans Outlook
              </span>
            </label>

            {preparerMail && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className={labelCls}>
                    E-mail du confrère{" "}
                    <span className="text-zinc-400 font-normal">(optionnel)</span>
                  </label>
                  <input
                    type="email"
                    value={emailConfrere}
                    onChange={(e) => setEmailConfrere(e.target.value)}
                    placeholder="ex. p.durand@cabinet-durand.fr"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Envoyer les pièces à</label>
                  <input
                    type="text"
                    value={destinatairePieces}
                    onChange={(e) => setDestinatairePieces(e.target.value)}
                    placeholder="ex. Jean DUPONT"
                    className={inputCls}
                  />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    «&nbsp;bien vouloir transmettre à …&nbsp;». Pré-rempli avec le dirigeant du
                    dossier.
                  </p>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Outlook s&apos;ouvre sur un brouillon prêt à relire. Le texte se modifie dans{" "}
                  <span className="font-medium">Paramétrage, Modèles d&apos;e-mails</span>. Pense à
                  y joindre le courrier téléchargé : un lien mailto ne peut pas porter de pièce
                  jointe.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
            Annuler
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!valid}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              valid ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white" : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            )}
          >
            {preparerMail
              ? `Générer le ${format === "pdf" ? "PDF" : ".docx"} et ouvrir Outlook`
              : `Générer le ${format === "pdf" ? "PDF" : ".docx"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** YYYY-MM-DD -> JJ/MM/AAAA (le générateur accepte les deux, on envoie déjà en clair). */
function frOf(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
