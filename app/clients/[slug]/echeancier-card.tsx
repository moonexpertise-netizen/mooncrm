"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { cn, fmtDateFr, statutColorClass } from "@/lib/utils";
import { slugForType } from "@/app/obligations/trackers";

type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

type Item = {
  type: string;
  periode: string;
  annee: number;
  echeance: string | null;
  statut_logique: StatutLogique;
  statut_detail: string | null;
  note: string | null;
  color?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  TVA_MENSUELLE: "TVA mensuelle",
  TVA_TRIMESTRIELLE: "TVA trimestrielle",
  TVA_ANNUELLE_CA12: "TVA CA12",
  TVA_NON_SOUMIS: "TVA non soumis",
  TVS: "TVS",
  IS_ACOMPTE: "IS acompte",
  IS_SOLDE: "IS solde",
  CVAE: "CVAE",
  CVAE_ACOMPTE: "CVAE acompte",
  CFE: "CFE",
  DAS2: "DAS2",
  DECL_2561: "IFU - Dividendes 2561",
  DECL_2777: "Flat-tax Dividendes 2777",
  OSS: "OSS",
  DES: "DES",
  LIASSE_PLAQUETTE: "Liasse / Plaquette",
  AGO_DEPOT: "AGO + dépôt",
  COMPTA: "Compta",
  DEPOT_COMPTES: "Dépôt comptes",
  FACTURATION_JUR: "Facturation Jur",
  ETAT_CREATION: "État création",
};

const STATUT_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
};

const MONTH_NAMES = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function periodeLisible(periode: string): string {
  if (/^\d{4}$/.test(periode)) return "Annuel";
  const mMonth = periode.match(/^(\d{4})-(\d{2})$/);
  if (mMonth) return `${MONTH_NAMES[parseInt(mMonth[2], 10) - 1]} ${mMonth[1]}`;
  const mQ = periode.match(/^T(\d)-(\d{4})$/);
  if (mQ) return `T${mQ[1]} ${mQ[2]}`;
  const mAcompte = periode.match(/^A-(\d{2})-(\d{4})$/);
  if (mAcompte) return `Acpt ${MONTH_NAMES[parseInt(mAcompte[1], 10) - 1]} ${mAcompte[2]}`;
  const mSolde = periode.match(/^S-(\d{4})$/);
  if (mSolde) return `Solde ${mSolde[1]}`;
  return periode;
}

type GroupMode = "chrono" | "month" | "type";

export default function EcheancierCard({
  clientId,
  annee,
  items,
  hasActiveSubs,
}: {
  clientId: string;
  annee: number;
  items: Item[];
  hasActiveSubs: boolean;
}) {
  const [mode, setMode] = useState<GroupMode>("chrono");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Tri global par échéance (avec nulls à la fin)
  const sorted = [...items].sort((a, b) => {
    if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance);
    if (a.echeance) return -1;
    if (b.echeance) return 1;
    return (a.type + a.periode).localeCompare(b.type + b.periode);
  });

  const total = sorted.length;
  const done = sorted.filter((i) => i.statut_logique === "TERMINE").length;
  const todo = sorted.filter((i) => i.statut_logique === "A_FAIRE").length;
  const wip = sorted.filter((i) => i.statut_logique === "EN_COURS").length;

  // Construction des groupes selon le mode
  let groups: Array<{ key: string; label: string; items: Item[] }> = [];
  if (mode === "chrono") {
    groups = [{ key: "all", label: "", items: sorted }];
  } else if (mode === "month") {
    const byMonth = new Map<string, Item[]>();
    for (const it of sorted) {
      let key = "Sans date";
      let label = "Sans date";
      if (it.echeance) {
        const [y, m] = it.echeance.split("-");
        key = `${y}-${m}`;
        label = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
      }
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(it);
    }
    // Tri des clés : YYYY-MM en premier (chronologique), "Sans date" à la fin
    const keys = [...byMonth.keys()].sort((a, b) => {
      if (a === "Sans date") return 1;
      if (b === "Sans date") return -1;
      return a.localeCompare(b);
    });
    groups = keys.map((k) => ({
      key: k,
      label:
        k === "Sans date"
          ? "Sans date"
          : `${MONTH_NAMES[parseInt(k.split("-")[1], 10) - 1]} ${k.split("-")[0]}`,
      items: byMonth.get(k)!,
    }));
  } else if (mode === "type") {
    const byType = new Map<string, Item[]>();
    for (const it of sorted) {
      if (!byType.has(it.type)) byType.set(it.type, []);
      byType.get(it.type)!.push(it);
    }
    const keys = [...byType.keys()].sort((a, b) =>
      (TYPE_LABEL[a] ?? a).localeCompare(TYPE_LABEL[b] ?? b, "fr")
    );
    groups = keys.map((k) => ({
      key: k,
      label: TYPE_LABEL[k] ?? k,
      items: byType.get(k)!,
    }));
  }

  // Si on regroupe (mois ou type), tout collapser/déplier en un coup
  const groupableMode = mode !== "chrono";
  const allCollapsed = groupableMode && groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  function toggleAll() {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(groups.map((g) => g.key)));
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b">
        <div>
          <h2 className="text-sm font-medium">Échéancier {annee}</h2>
          <div className="text-xs text-muted-foreground mt-0.5">
            {total} échéance{total > 1 ? "s" : ""}{" "}<span className="text-zinc-300 dark:text-zinc-600" aria-hidden>|</span>{" "}{done} terminé{done > 1 ? "s" : ""}{" "}<span className="text-zinc-300 dark:text-zinc-600" aria-hidden>|</span>{" "}{wip} en cours{" "}<span className="text-zinc-300 dark:text-zinc-600" aria-hidden>|</span>{" "}{todo} à faire
          </div>
        </div>
        <div className="flex items-center gap-2">
          {groupableMode && groups.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-100 text-zinc-700"
            >
              {allCollapsed ? "Tout déplier" : "Tout réduire"}
            </button>
          )}
          <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden text-xs">
            <ModeBtn current={mode} value="chrono" onClick={setMode}>
              Chronologique
            </ModeBtn>
            <ModeBtn current={mode} value="month" onClick={setMode}>
              Par mois
            </ModeBtn>
            <ModeBtn current={mode} value="type" onClick={setMode}>
              Par type
            </ModeBtn>
          </div>
        </div>
      </div>

      {!total ? (
        <p className="p-4 text-sm text-muted-foreground">
          {hasActiveSubs
            ? "Les abonnements sont actifs mais aucune échéance générée. Modifie le paramétrage pour les déclencher."
            : "Coche d'abord des obligations dans le paramétrage."}
        </p>
      ) : (
        <div>
          {groups.map((g) => {
            const isCollapsed = groupableMode && collapsed.has(g.key);
            const doneInGroup = g.items.filter((i) => i.statut_logique === "TERMINE").length;
            return (
              <div key={g.key}>
                {g.label && groupableMode && (
                  <button
                    onClick={() => toggleCollapse(g.key)}
                    className="w-full px-4 py-2 bg-zinc-50 text-xs uppercase tracking-wide font-medium text-zinc-600 border-t flex items-center justify-between hover:bg-zinc-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block transition-transform text-zinc-400",
                          isCollapsed ? "-rotate-90" : ""
                        )}
                      >
                        ▼
                      </span>
                      {g.label}{" "}
                      <span className="text-zinc-400 normal-case font-normal">({g.items.length})</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 normal-case font-normal">
                      {doneInGroup}/{g.items.length} terminé{doneInGroup > 1 ? "s" : ""}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <ul className="divide-y">
                    {g.items.map((o, i) => {
                      const slug = slugForType(o.type);
                      const focus = slug ? `${clientId}_${o.type}_${o.periode}` : null;
                      const href = slug
                        ? `/obligations/${slug}?year=${annee}&focus=${encodeURIComponent(focus!)}`
                        : null;
                      // Mobile : echeance + label sur la 1re ligne, periode +
                      // detail + statut sur la 2e ligne. Plus de w-24/w-40
                      // fixes qui debordaient sur petit ecran.
                      const content = (
                        <>
                          <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
                            <div className="w-20 sm:w-24 shrink-0 text-zinc-600 dark:text-zinc-400 tabular-nums">
                              {o.echeance ? fmtDateFr(o.echeance) : <span className="text-zinc-400 dark:text-zinc-500">-</span>}
                            </div>
                            <div className="sm:w-40 shrink-0 font-medium flex items-center gap-1.5 min-w-0 truncate">
                              <span className="truncate text-zinc-900 dark:text-zinc-100">
                                {TYPE_LABEL[o.type] ?? o.type}
                              </span>
                              {o.note && (
                                <MessageSquare
                                  className="h-3 w-3 text-amber-500 shrink-0"
                                  aria-label={`Note : ${o.note}`}
                                />
                              )}
                            </div>
                            <div className="hidden sm:block w-32 shrink-0 text-zinc-600 dark:text-zinc-400">{periodeLisible(o.periode)}</div>
                            <div className="hidden sm:block flex-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {o.note ? <span className="italic">{o.note}</span> : (o.statut_detail ?? "-")}
                            </div>
                          </div>
                          {/* Mobile : periode + statut sur la 2e ligne pour ne pas deborder */}
                          <div className="flex items-center gap-2 sm:gap-0 w-full sm:w-auto justify-between sm:justify-end pl-20 sm:pl-0">
                            <span className="sm:hidden text-[11px] text-zinc-500 dark:text-zinc-400">
                              {periodeLisible(o.periode)}
                            </span>
                            <span
                              className={cn(
                                "inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium border shrink-0 transition-colors",
                                statutColorClass(o.statut_logique, o.color)
                              )}
                            >
                              {STATUT_LABEL[o.statut_logique]}
                            </span>
                            <span className="hidden sm:inline text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all shrink-0 w-3 text-center">
                              ›
                            </span>
                          </div>
                        </>
                      );
                      return (
                        <li key={i}>
                          {href ? (
                            <Link
                              href={href}
                              prefetch={false}
                              className="px-3 sm:px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-3 text-sm group hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors min-h-[44px]"
                              title="Aller à la cellule dans le tableau global"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div className="px-3 sm:px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-3 text-sm group">
                              {content}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  current,
  value,
  children,
  onClick,
}: {
  current: GroupMode;
  value: GroupMode;
  children: React.ReactNode;
  onClick: (v: GroupMode) => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={cn(
        "px-2 py-1 transition-colors",
        active ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
      )}
    >
      {children}
    </button>
  );
}
