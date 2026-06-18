"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan } from "@/app/_components/permissions-context";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { createTimeEntry, deleteTimeEntry } from "./actions";
import { Combobox, type ComboOption } from "./combobox";

export type Entry = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  clientSlug: string | null;
  categorieAutre: string | null;
  activiteId: string | null;
  activiteLibelle: string | null;
  dateJour: string;
  dureeMinutes: number;
  annee: number;
  commentaire: string | null;
  facturable: boolean;
};

/** Catégories pour le travail « Autre » (hors dossier comptable). */
const AUTRE_CATEGORIES = [
  "Interne",
  "Commercial / prospection",
  "Formation",
  "Absence / congés",
  "Réunion interne",
  "Autre",
];

const JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const MOIS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const diff = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().substring(0, 10);
}
function weekdayIndex(iso: string): number {
  return (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
}
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${JOURS[weekdayIndex(iso)]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}
/** "1,5" / "1.5" -> 90 minutes. null si invalide. */
function hoursToMinutes(s: string): number | null {
  const cleaned = s.replace(",", ".").trim();
  if (!cleaned) return null;
  const h = parseFloat(cleaned);
  if (!Number.isFinite(h) || h <= 0) return null;
  return Math.round(h * 60);
}
function fmtHours(min: number): string {
  return (
    (min / 60).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " h"
  );
}
/** Minutes -> chaîne décimale pour pré-remplir le champ durée (90 -> "1,5"). */
function minutesToDecimal(min: number): string {
  return (min / 60).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

const INPUT_CLS =
  "h-9 px-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 disabled:cursor-not-allowed";

export default function MesTemps({
  weekStart,
  entries,
  activites,
  clients,
}: {
  weekStart: string;
  entries: Entry[];
  activites: { id: string; libelle: string }[];
  clients: { id: string; denomination: string }[];
}) {
  const router = useRouter();
  const canSaisir = useCan("saisir_temps");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );
  const todayIso = useMemo(() => new Date().toISOString().substring(0, 10), []);
  const defaultDay = days.includes(todayIso) ? todayIso : weekStart;

  // Options des champs de recherche assistée.
  const dossierOptions = useMemo<ComboOption[]>(
    () => [
      { value: "__autre", label: "Autre (hors dossier)" },
      ...clients.map((c) => ({ value: c.id, label: c.denomination })),
    ],
    [clients]
  );
  const activiteOptions = useMemo<ComboOption[]>(
    () => activites.map((a) => ({ value: a.id, label: a.libelle })),
    [activites]
  );

  // --- Vue : semaine (toutes les journées) ou jour (une seule) ---
  const [viewMode, setViewMode] = useState<"semaine" | "jour">("semaine");

  // --- Formulaire d'ajout rapide ---
  const [dossier, setDossier] = useState<string>(""); // clientId | "__autre" | ""
  const [categorieAutre, setCategorieAutre] = useState<string>(AUTRE_CATEGORIES[0]);
  const [activiteId, setActiviteId] = useState<string>("");
  const [duree, setDuree] = useState<string>("");
  const [jour, setJour] = useState<string>(defaultDay);
  const [commentaire, setCommentaire] = useState<string>("");
  const [facturable, setFacturable] = useState<boolean>(true);

  // Quand on change de semaine, on recale le jour ciblé dans la semaine.
  useEffect(() => {
    setJour((j) => (days.includes(j) ? j : defaultDay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const isAutre = dossier === "__autre";

  function resetForm() {
    setDuree("");
    setCommentaire("");
    // on garde dossier / activité / jour : souvent on enchaîne sur le même.
  }

  function submit() {
    if (!canSaisir) return;
    if (!dossier) {
      toastError("Choisissez un dossier (ou « Autre »).");
      return;
    }
    const minutes = hoursToMinutes(duree);
    if (minutes === null) {
      toastError("Durée invalide (ex. 1,5 pour 1 h 30).");
      return;
    }
    if (isAutre && !commentaire.trim()) {
      toastError("Hors dossier : un commentaire est obligatoire.");
      return;
    }
    const annee = parseInt(jour.substring(0, 4), 10);
    startTransition(async () => {
      const res = await createTimeEntry({
        clientId: isAutre ? null : dossier,
        categorieAutre: isAutre ? categorieAutre : null,
        activiteId: activiteId || null,
        dateJour: jour,
        dureeMinutes: minutes,
        annee,
        commentaire: commentaire.trim() || null,
        facturable,
      });
      if (!res.ok) {
        toastError(res.error ?? "Enregistrement impossible.");
        return;
      }
      resetForm();
      toastSuccess("Temps enregistré");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteTimeEntry(id);
      if (!res.ok) {
        toastError(res.error ?? "Suppression impossible.");
        return;
      }
      router.refresh();
    });
  }

  /** Recopie une ligne dans le formulaire (bouton dupliquer). */
  function duplicate(e: Entry) {
    if (!canSaisir) return;
    setDossier(e.clientId ?? "__autre");
    setCategorieAutre(e.categorieAutre ?? AUTRE_CATEGORIES[0]);
    setActiviteId(e.activiteId ?? "");
    setDuree(minutesToDecimal(e.dureeMinutes));
    setCommentaire(e.commentaire ?? "");
    setFacturable(e.facturable);
    setJour(e.dateJour);
    if (viewMode === "jour") setJour(e.dateJour);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    toastSuccess("Copié dans le formulaire — ajuste et valide");
  }

  const weekTotal = entries.reduce((s, e) => s + e.dureeMinutes, 0);
  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  const thisWeek = mondayOf(todayIso);

  const jourIdx = days.indexOf(jour);
  // Jours affichés dans la liste selon la vue.
  const shownDays = viewMode === "jour" ? days.filter((d) => d === jour) : days;

  return (
    <div className="space-y-5">
      {/* Sélecteur de semaine + bascule vue */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => router.push(`/temps?semaine=${prevWeek}`)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="px-4 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.15] bg-white dark:bg-white/[0.08] text-sm font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums text-center min-w-[210px]">
          du {dayLabel(weekStart)} au {dayLabel(addDaysIso(weekStart, 6))}
        </div>
        <button
          type="button"
          onClick={() => router.push(`/temps?semaine=${nextWeek}`)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {weekStart !== thisWeek && (
          <button
            type="button"
            onClick={() => router.push(`/temps?semaine=${thisWeek}`)}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 ml-1"
          >
            Cette semaine
          </button>
        )}

        {/* Bascule Semaine / Jour */}
        <div className="inline-flex rounded-md border border-zinc-200 dark:border-white/[0.12] overflow-hidden ml-1">
          {(["semaine", "jour"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={cn(
                "px-3 h-9 text-sm transition-colors",
                viewMode === m
                  ? "bg-zinc-900 text-white dark:bg-white/[0.12] dark:text-zinc-50"
                  : "bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08]"
              )}
            >
              {m === "semaine" ? "Semaine" : "Jour"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          <Clock className="h-4 w-4 text-zinc-400" />
          <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{fmtHours(weekTotal)}</span>
          <span className="text-zinc-400">cette semaine</span>
        </div>
      </div>

      {/* Sélecteur de jour (vue Jour) */}
      {viewMode === "jour" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => jourIdx > 0 && setJour(days[jourIdx - 1])}
            disabled={jourIdx <= 0}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Jour précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="px-3 py-1 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-sm font-medium text-zinc-900 dark:text-zinc-100 min-w-[140px] text-center capitalize">
            {dayLabel(jour)}
          </div>
          <button
            type="button"
            onClick={() => jourIdx < 6 && setJour(days[jourIdx + 1])}
            disabled={jourIdx >= 6}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Jour suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Barre d'ajout rapide */}
      <div ref={formRef} className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            value={dossier}
            onChange={setDossier}
            options={dossierOptions}
            placeholder="Rechercher un dossier…"
            disabled={!canSaisir}
            ariaLabel="Dossier"
            className="flex-1 min-w-[200px]"
          />

          {isAutre && (
            <select
              value={categorieAutre}
              onChange={(e) => setCategorieAutre(e.target.value)}
              disabled={!canSaisir}
              className={cn(INPUT_CLS, "min-w-[150px]")}
              aria-label="Catégorie"
            >
              {AUTRE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <Combobox
            value={activiteId}
            onChange={setActiviteId}
            options={activiteOptions}
            placeholder="Activité…"
            disabled={!canSaisir}
            ariaLabel="Activité"
            className="min-w-[150px] w-[180px]"
          />

          <input
            type="text"
            inputMode="decimal"
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="1,5 h"
            disabled={!canSaisir}
            className={cn(INPUT_CLS, "w-[72px] text-center")}
            aria-label="Durée en heures"
          />

          {viewMode === "semaine" && (
            <select
              value={jour}
              onChange={(e) => setJour(e.target.value)}
              disabled={!canSaisir}
              className={cn(INPUT_CLS, "min-w-[120px]")}
              aria-label="Jour"
            >
              {days.map((d) => (
                <option key={d} value={d}>{dayLabel(d)}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSaisir || isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-gold text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>

        <div className="flex items-center gap-3 mt-2 px-0.5">
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={facturable}
              onChange={(e) => setFacturable(e.target.checked)}
              disabled={!canSaisir}
              className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-white/[0.2] accent-[hsl(var(--gold))]"
            />
            Facturable
          </label>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Durée en heures décimales (1,5 = 1 h 30)
            {viewMode === "jour" && <> · saisie pour le {dayLabel(jour)}</>}.
          </span>
        </div>

        {isAutre && (
          <input
            type="text"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Commentaire (obligatoire hors dossier)…"
            disabled={!canSaisir}
            className={cn(INPUT_CLS, "w-full mt-2")}
            aria-label="Commentaire"
          />
        )}

        {!canSaisir && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
            Votre profil ne permet pas la saisie des temps (lecture seule).
          </p>
        )}
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {shownDays.map((d) => {
          const dayEntries = entries.filter((e) => e.dateJour === d);
          if (dayEntries.length === 0) return null;
          const total = dayEntries.reduce((s, e) => s + e.dureeMinutes, 0);
          return (
            <section
              key={d}
              className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-50/60 dark:bg-white/[0.02] border-b border-zinc-100 dark:border-white/[0.06]">
                <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 capitalize">{dayLabel(d)}</span>
                <span className="text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300">{fmtHours(total)}</span>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {dayEntries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      {e.clientId && e.clientSlug ? (
                        <Link
                          href={`/clients/${e.clientSlug}`}
                          className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors truncate block"
                        >
                          {e.clientName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                          Autre · {e.categorieAutre}
                        </span>
                      )}
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {e.activiteLibelle && <span>{e.activiteLibelle}</span>}
                        {e.activiteLibelle && e.commentaire && <span className="mx-1">·</span>}
                        {e.commentaire && <span>{e.commentaire}</span>}
                        {!e.facturable && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400">
                            non facturable
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 shrink-0">
                      {fmtHours(e.dureeMinutes)}
                    </span>
                    <button
                      type="button"
                      onClick={() => duplicate(e)}
                      disabled={!canSaisir}
                      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Dupliquer cette saisie"
                      title="Dupliquer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      disabled={!canSaisir || isPending}
                      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Supprimer"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {/* États vides */}
        {viewMode === "semaine" && entries.length === 0 && (
          <EmptyState label="Aucun temps saisi cette semaine." />
        )}
        {viewMode === "jour" && entries.filter((e) => e.dateJour === jour).length === 0 && (
          <EmptyState label={`Aucun temps saisi le ${dayLabel(jour)}.`} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 dark:border-white/[0.08] py-12 text-center">
      <Clock className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto" />
      <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">{label}</p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">Ajoutez une ligne ci-dessus.</p>
    </div>
  );
}
