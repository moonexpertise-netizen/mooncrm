"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Combobox, type ComboOption } from "../combobox";

export type PEntry = {
  id: string;
  userId: string;
  collaborateur: string;
  clientId: string | null;
  clientName: string | null;
  clientSlug: string | null;
  categorieAutre: string | null;
  activiteId: string | null;
  activiteLibelle: string | null;
  dateJour: string;
  dureeMinutes: number;
  commentaire: string | null;
  facturable: boolean;
};

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
function fmtH(min: number): string {
  return (min / 60).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " h";
}
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Palette de couleurs par collaborateur (chips à fond clair + texte foncé,
 *  lisibles en clair comme en sombre car le chip porte son propre fond). */
const PALETTE = [
  { bg: "#E1F5EE", fg: "#0F6E56" },
  { bg: "#E6F1FB", fg: "#0C447C" },
  { bg: "#FAECE7", fg: "#993C1D" },
  { bg: "#FBEAF0", fg: "#993556" },
  { bg: "#EEEDFE", fg: "#3C3489" },
  { bg: "#FAEEDA", fg: "#854F0B" },
  { bg: "#EAF3DE", fg: "#3B6D11" },
  { bg: "#F1EFE8", fg: "#444441" },
];

export default function Planning({
  weekStart,
  entries,
  collaborateurs,
  clients,
  activites,
}: {
  weekStart: string;
  entries: PEntry[];
  collaborateurs: { id: string; name: string }[];
  clients: { id: string; denomination: string }[];
  activites: { id: string; libelle: string }[];
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"semaine" | "jour">("semaine");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );
  const todayIso = useMemo(() => new Date().toISOString().substring(0, 10), []);
  const [jour, setJour] = useState<string>(days.includes(todayIso) ? todayIso : weekStart);
  const jourIdx = days.indexOf(jour);

  // Filtres
  const [collab, setCollab] = useState<string>("");
  const [dossier, setDossier] = useState<string>("");
  const [activite, setActivite] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const colorOf = useMemo(() => {
    const idx = new Map<string, number>();
    collaborateurs.forEach((c, i) => idx.set(c.id, i));
    return (userId: string) => PALETTE[(idx.get(userId) ?? 0) % PALETTE.length];
  }, [collaborateurs]);

  const dossierOptions = useMemo<ComboOption[]>(
    () => [
      { value: "", label: "Tous les dossiers" },
      { value: "__autre", label: "Autre (hors dossier)" },
      ...clients.map((c) => ({ value: c.id, label: c.denomination })),
    ],
    [clients]
  );

  const filtered = useMemo(() => {
    const nq = norm(q);
    return entries.filter((e) => {
      if (collab && e.userId !== collab) return false;
      if (dossier === "__autre" && e.clientId !== null) return false;
      if (dossier && dossier !== "__autre" && e.clientId !== dossier) return false;
      if (activite && e.activiteId !== activite) return false;
      if (nq) {
        const hay = norm(
          `${e.clientName ?? ""} ${e.categorieAutre ?? ""} ${e.activiteLibelle ?? ""} ${e.commentaire ?? ""} ${e.collaborateur}`
        );
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [entries, collab, dossier, activite, q]);

  const hasFilters = collab || dossier || activite || q;
  function resetFilters() {
    setCollab("");
    setDossier("");
    setActivite("");
    setQ("");
  }

  const weekTotal = filtered.reduce((s, e) => s + e.dureeMinutes, 0);
  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  const thisWeek = mondayOf(todayIso);

  function dossierLabel(e: PEntry): string {
    return e.clientId ? e.clientName ?? "Dossier" : `Autre · ${e.categorieAutre ?? ""}`;
  }

  return (
    <div className="space-y-4">
      {/* Barre nav semaine + bascule vue */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => router.push(`/temps/planning?semaine=${prevWeek}`)}
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
          onClick={() => router.push(`/temps/planning?semaine=${nextWeek}`)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {weekStart !== thisWeek && (
          <button
            type="button"
            onClick={() => router.push(`/temps/planning?semaine=${thisWeek}`)}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 ml-1"
          >
            Cette semaine
          </button>
        )}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08] ml-1">
          {(["semaine", "jour"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              aria-current={viewMode === m ? "true" : undefined}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-all",
                viewMode === m
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
              )}
            >
              {m === "semaine" ? "Semaine" : "Jour"}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-zinc-600 dark:text-zinc-300">
          <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{fmtH(weekTotal)}</span>
          <span className="text-zinc-400"> au total{hasFilters ? " (filtré)" : ""}</span>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-2.5 shadow-card">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (dossier, activité, collaborateur…)"
            className="h-9 w-full pl-8 pr-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            aria-label="Recherche"
          />
        </div>
        <select
          value={collab}
          onChange={(e) => setCollab(e.target.value)}
          className="h-9 px-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] min-w-[150px]"
          aria-label="Collaborateur"
        >
          <option value="">Tous les collaborateurs</option>
          {collaborateurs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Combobox
          value={dossier}
          onChange={setDossier}
          options={dossierOptions}
          placeholder="Dossier…"
          ariaLabel="Filtrer par dossier"
          className="min-w-[170px] w-[200px]"
        />
        <select
          value={activite}
          onChange={(e) => setActivite(e.target.value)}
          className="h-9 px-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] min-w-[130px]"
          aria-label="Activité"
        >
          <option value="">Toutes activités</option>
          {activites.map((a) => (
            <option key={a.id} value={a.id}>{a.libelle}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Réinitialiser
          </button>
        )}
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

      {/* Vue Semaine : 7 colonnes */}
      {viewMode === "semaine" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map((d) => {
            const dayEntries = filtered
              .filter((e) => e.dateJour === d)
              .sort((a, b) => a.collaborateur.localeCompare(b.collaborateur, "fr"));
            const total = dayEntries.reduce((s, e) => s + e.dureeMinutes, 0);
            return (
              <div
                key={d}
                className="rounded-lg border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-2 min-h-[90px] flex flex-col"
              >
                <div className="flex items-baseline justify-between gap-1 mb-1.5 px-0.5">
                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 capitalize truncate">
                    {dayLabel(d)}
                  </span>
                  {total > 0 && (
                    <span className="text-[10px] tabular-nums text-zinc-400 shrink-0">{fmtH(total)}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEntries.map((e) => {
                    const c = colorOf(e.userId);
                    return (
                      <div
                        key={e.id}
                        title={`${e.collaborateur} · ${dossierLabel(e)}${e.activiteLibelle ? ` · ${e.activiteLibelle}` : ""}${e.commentaire ? ` · ${e.commentaire}` : ""}`}
                        style={{ backgroundColor: c.bg }}
                        className="rounded-md px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span style={{ color: c.fg }} className="text-[11px] font-semibold truncate">
                            {dossierLabel(e)}
                          </span>
                          <span style={{ color: c.fg }} className="text-[11px] font-semibold tabular-nums shrink-0">
                            {fmtH(e.dureeMinutes)}
                          </span>
                        </div>
                        <div style={{ color: c.fg }} className="text-[10px] opacity-80 truncate">
                          {e.collaborateur}
                          {e.activiteLibelle ? ` · ${e.activiteLibelle}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vue Jour : couloirs par collaborateur */}
      {viewMode === "jour" && (
        <DayView
          dayEntries={filtered.filter((e) => e.dateJour === jour)}
          collaborateurs={collaborateurs}
          colorOf={colorOf}
          dossierLabel={dossierLabel}
          jourLabel={dayLabel(jour)}
        />
      )}
    </div>
  );
}

function DayView({
  dayEntries,
  collaborateurs,
  colorOf,
  dossierLabel,
  jourLabel,
}: {
  dayEntries: PEntry[];
  collaborateurs: { id: string; name: string }[];
  colorOf: (userId: string) => { bg: string; fg: string };
  dossierLabel: (e: PEntry) => string;
  jourLabel: string;
}) {
  // Regroupe par collaborateur (uniquement ceux qui ont des lignes ce jour).
  const groups = useMemo(() => {
    const byUser = new Map<string, PEntry[]>();
    for (const e of dayEntries) {
      const arr = byUser.get(e.userId) ?? [];
      arr.push(e);
      byUser.set(e.userId, arr);
    }
    const order = new Map(collaborateurs.map((c, i) => [c.id, i]));
    return [...byUser.entries()].sort(
      (a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99)
    );
  }, [dayEntries, collaborateurs]);

  if (dayEntries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 dark:border-white/[0.08] py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Aucune saisie le {jourLabel}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {groups.map(([userId, list]) => {
        const c = colorOf(userId);
        const total = list.reduce((s, e) => s + e.dureeMinutes, 0);
        return (
          <div
            key={userId}
            className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06]">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  style={{ backgroundColor: c.bg, color: c.fg }}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0"
                >
                  {list[0].collaborateur.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {list[0].collaborateur}
                </span>
              </span>
              <span className="text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0">{fmtH(total)}</span>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {list.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    {e.clientId && e.clientSlug ? (
                      <Link
                        href={`/clients/${e.clientSlug}`}
                        className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors truncate block"
                      >
                        {dossierLabel(e)}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate block">
                        {dossierLabel(e)}
                      </span>
                    )}
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {e.activiteLibelle}
                      {e.activiteLibelle && e.commentaire ? " · " : ""}
                      {e.commentaire}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 shrink-0">
                    {fmtH(e.dureeMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
