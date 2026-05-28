"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlert } from "@/app/_components/confirm-modal";
import {
  reconduireAnnee,
  setRegime as setRegimeAction,
  setTvaMode,
  toggleSubscription,
  updateClient,
  type Regime,
  type TypeObligation,
} from "./actions";

type SubKey =
  | "TVS" | "IS_ACOMPTE" | "IS_SOLDE" | "CVAE" | "CVAE_ACOMPTE"
  | "DAS2" | "DECL_2561" | "DECL_2777" | "OSS" | "DES"
  | "LIASSE_PLAQUETTE" | "AGO_DEPOT";

type TvaMode = "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS";

// Ordre métier MOON : bilan annuel → IS → autres taxes → déclarations.
// CVAE solde retirée : toujours vérifiée manuellement. Seuls les acomptes
// CVAE restent paramétrables (déclenchés si CVAE N-1 > 1 500 €).
// IS Acomptes retirés : auto-activés pour tout dossier en régime IS.
const SUB_ROWS: { key: SubKey; label: string }[] = [
  { key: "LIASSE_PLAQUETTE", label: "Liasse / Plaquette" },
  { key: "DAS2", label: "DAS2" },
  { key: "AGO_DEPOT", label: "AGO / dépôt" },
  { key: "IS_SOLDE", label: "IS - Solde" },
  { key: "TVS", label: "TVS" },
  { key: "CVAE_ACOMPTE", label: "CVAE - Acomptes" },
  { key: "DECL_2777", label: "Flat-tax 2777" },
  { key: "DECL_2561", label: "IFU 2561" },
  { key: "OSS", label: "OSS (Guichet unique)" },
  { key: "DES", label: "DES" },
];

const TVA_MODES: { value: TvaMode; label: string }[] = [
  { value: "TVA_MENSUELLE", label: "Mensuelle" },
  { value: "TVA_TRIMESTRIELLE", label: "Trimestrielle" },
  { value: "TVA_ANNUELLE_CA12", label: "Annuelle" },
  { value: "TVA_NON_SOUMIS", label: "Non soumis" },
];

const TVA_TYPES = ["TVA_MENSUELLE", "TVA_TRIMESTRIELLE", "TVA_ANNUELLE_CA12", "TVA_NON_SOUMIS"];

export type Sub = { type: string; annee: number; actif: boolean };
export type YearConfig = { annee: number; regime: Regime | null };

export default function ObligationsMatrix({
  clientId,
  subs,
  yearConfigs,
  years,
  debutObligations,
}: {
  clientId: string;
  subs: Sub[];
  yearConfigs: YearConfig[];
  years: number[];
  /** Date "Prise en charge" YYYY-MM-DD ou null — années antérieures marquées "—" */
  debutObligations: string | null;
}) {
  // Année de reprise (4 premiers chars), null si pas défini
  const debutYear =
    debutObligations && /^\d{4}/.test(debutObligations)
      ? parseInt(debutObligations.slice(0, 4), 10)
      : null;

  function isBeforeDebut(y: number): boolean {
    return debutYear !== null && y < debutYear;
  }

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { alert, AlertDialog } = useAlert();

  // Reconductions en attente (draft) : sequence à appliquer dans l'ordre
  const [pendingReconduits, setPendingReconduits] = useState<Array<{ from: number; to: number }>>([]);

  /**
   * État affiché = source + application séquentielle des reconductions en
   * attente. Permet de prévisualiser sans toucher au serveur.
   */
  const display = useMemo(() => {
    let curSubs = subs.map((s) => ({ ...s }));
    const curRegimes = yearConfigs.map((c) => ({ ...c }));
    for (const { from, to } of pendingReconduits) {
      const sourceTypes = new Set(
        curSubs.filter((s) => s.annee === from && s.actif).map((s) => s.type)
      );
      // Mirror : pour chaque type, ouvert si dans source, fermé sinon
      curSubs = curSubs.map((s) => {
        if (s.annee !== to) return s;
        return { ...s, actif: sourceTypes.has(s.type) };
      });
      for (const type of sourceTypes) {
        if (!curSubs.some((s) => s.annee === to && s.type === type)) {
          curSubs.push({ type, annee: to, actif: true });
        }
      }
      // Régime
      const sourceRegime = curRegimes.find((r) => r.annee === from)?.regime ?? null;
      const i = curRegimes.findIndex((r) => r.annee === to);
      if (i >= 0) curRegimes[i] = { ...curRegimes[i], regime: sourceRegime };
      else curRegimes.push({ annee: to, regime: sourceRegime });
    }
    return { subs: curSubs, regimes: curRegimes };
  }, [subs, yearConfigs, pendingReconduits]);

  function isActive(type: string, annee: number): boolean {
    return display.subs.some((s) => s.type === type && s.annee === annee && s.actif);
  }
  function getTva(annee: number): TvaMode | null {
    const tva = display.subs.find(
      (s) => s.annee === annee && s.actif && TVA_TYPES.includes(s.type)
    );
    return (tva?.type as TvaMode | undefined) ?? null;
  }
  function getRegime(annee: number): Regime | null {
    return display.regimes.find((x) => x.annee === annee)?.regime ?? null;
  }
  function isYearInDraft(year: number): boolean {
    return pendingReconduits.some((p) => p.to === year);
  }

  function queueReconduit(from: number) {
    const to = from + 1;
    setPendingReconduits((prev) => {
      // Évite les doublons ; remplace si déjà en file pour le même `to`
      const filtered = prev.filter((p) => p.to !== to);
      return [...filtered, { from, to }];
    });
  }

  function cancelDrafts() {
    setPendingReconduits([]);
  }

  function commitDrafts() {
    if (pendingReconduits.length === 0) return;
    const draft = [...pendingReconduits];
    // Vider la sélection draft tout de suite (optimistic UI)
    setPendingReconduits([]);
    startTransition(async () => {
      // Si toutes les sources sont différentes (pas de chaîne), parallélise.
      // Sinon (ex. 2024→2025 puis 2025→2026), exécution séquentielle.
      const sources = new Set(draft.map((d) => d.from));
      const targets = new Set(draft.map((d) => d.to));
      const hasChain = [...sources].some((s) => targets.has(s));
      if (hasChain) {
        for (const { from, to } of draft) await reconduireAnnee(clientId, from, to);
      } else {
        await Promise.all(draft.map((d) => reconduireAnnee(clientId, d.from, d.to)));
      }
    });
  }

  function onToggle(type: SubKey, annee: number) {
    if (pendingReconduits.length > 0) {
      void alert({
        title: "Reconductions en attente",
        description: "Valide d'abord les reconductions en attente, ou annule-les.",
      });
      return;
    }
    const current = isActive(type, annee);
    startTransition(async () => {
      await toggleSubscription(clientId, type as TypeObligation, annee, !current);
      // Refresh : toggleSubscription cree/desactive des obligations cote
      // serveur. La matrice doit refleter immediatement les nouvelles
      // souscriptions sans reload.
      router.refresh();
    });
  }

  function onTva(annee: number, mode: TvaMode | null) {
    if (pendingReconduits.length > 0) {
      void alert({
        title: "Reconductions en attente",
        description: "Valide d'abord les reconductions en attente, ou annule-les.",
      });
      return;
    }
    startTransition(async () => {
      await setTvaMode(clientId, annee, mode);
      router.refresh();
    });
  }

  function onRegime(annee: number, regime: Regime | null) {
    if (pendingReconduits.length > 0) {
      void alert({
        title: "Reconductions en attente",
        description: "Valide d'abord les reconductions en attente, ou annule-les.",
      });
      return;
    }
    startTransition(async () => {
      await setRegimeAction(clientId, annee, regime);
      router.refresh();
    });
  }

  function onDebutChange(year: number | null) {
    if (pendingReconduits.length > 0) {
      void alert({
        title: "Reconductions en attente",
        description: "Valide d'abord les reconductions en attente, ou annule-les.",
      });
      return;
    }
    startTransition(async () => {
      await updateClient(clientId, {
        debut_obligations: year ? `${year}-01-01` : null,
      });
      // debut_obligations desactive les subscriptions des annees anterieures
      // cote serveur : la matrice doit le voir sans reload.
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {AlertDialog}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Vue inversée : pour chaque obligation, coche les années où elle s&apos;applique.
          Clic sur l&apos;icône <ChevronRight className="inline h-3.5 w-3.5 text-[hsl(var(--gold))] -mt-0.5" /> à côté d&apos;une année pour la reconduire à la suivante en mode draft.
        </div>

        {/* Sélecteur Reprise à partir de — pré-remplit les années antérieures avec "—" */}
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="debut-obligations" className="text-zinc-600 font-medium">
            Reprise à partir de
          </label>
          <select
            id="debut-obligations"
            value={debutYear ?? ""}
            onChange={(e) =>
              onDebutChange(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            disabled={isPending || pendingReconduits.length > 0}
            className={cn(
              "px-2 py-1 rounded border text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold))]",
              debutYear !== null
                ? "border-[hsl(var(--gold))]/40 text-[hsl(var(--gold-dark))] font-medium"
                : "border-zinc-300 text-zinc-700"
            )}
          >
            <option value="">Aucune (tout actif)</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {debutYear !== null && (
            <span className="text-zinc-500 text-[11px]">
              Années &lt; {debutYear} marquées « - »
            </span>
          )}
        </div>
      </div>

      {/* Barre flottante quand draft */}
      {pendingReconduits.length > 0 && (
        <div className="sticky top-16 z-20 rounded-lg bg-[#0D1122] dark:bg-[hsl(var(--surface-elevated))] text-white px-4 py-2.5 flex items-center gap-3 shadow-xl ring-1 ring-white/10 dark:ring-white/[0.18] animate-slide-up-fade">
          <span className="text-sm font-medium">
            {pendingReconduits.length} reconduction{pendingReconduits.length > 1 ? "s" : ""} en attente
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            {pendingReconduits.map((p, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-white/10 tabular-nums">
                {p.from} - {p.to}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={cancelDrafts}
              disabled={isPending}
              className="text-xs px-2.5 py-1 rounded-md text-zinc-300 hover:bg-white/10 transition"
            >
              Annuler
            </button>
            <button
              onClick={commitDrafts}
              disabled={isPending}
              className="text-xs px-3 py-1 rounded-md bg-[hsl(var(--gold))] text-white hover:opacity-90 transition font-medium"
            >
              {isPending ? "Validation…" : "Valider"}
            </button>
          </div>
        </div>
      )}

      <div className={cn("rounded-lg border overflow-auto bg-card max-h-[calc(100vh-310px)]", isPending && "opacity-80")}>
        <table className="w-full text-sm border-collapse">
          <thead className="bg-zinc-50 text-zinc-700 text-xs sticky top-0 z-20 shadow-[0_1px_0_0_rgb(228_228_231)]">
            <tr>
              <th className="sticky left-0 z-30 bg-zinc-50 text-left px-3 py-2 font-medium border-r min-w-[180px]">
                Obligation
              </th>
              {years.map((y) => {
                const draft = isYearInDraft(y);
                const before = isBeforeDebut(y);
                return (
                  <th
                    key={y}
                    className={cn(
                      "px-2 py-2 font-medium text-center min-w-[100px]",
                      draft && "bg-[hsl(var(--gold))]/10",
                      before && "text-zinc-400 bg-zinc-100"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{y}</span>
                      {draft && (
                        <span
                          className="text-[10px] text-[hsl(var(--gold-dark))] font-medium uppercase tracking-wide"
                          title="Modifications en attente sur cette année"
                        >
                          draft
                        </span>
                      )}
                      {!before && (
                        <button
                          onClick={() => queueReconduit(y)}
                          className="inline-flex items-center justify-center w-5 h-5 rounded text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/15 transition opacity-60 hover:opacity-100"
                          title={`Reconduire ${y} vers ${y + 1} (draft)`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Régime fiscal */}
            <tr className="border-t bg-amber-50/30">
              <td className="sticky left-0 z-10 bg-amber-50/30 px-3 py-2 border-r font-medium">Régime fiscal</td>
              {years.map((y) => {
                const before = isBeforeDebut(y);
                if (before) {
                  return (
                    <td key={y} className="px-1 py-1 text-center align-middle bg-zinc-100 text-zinc-400">-</td>
                  );
                }
                const r = getRegime(y);
                return (
                  <td key={y} className="px-1 py-1 text-center align-middle">
                    <select
                      value={r ?? ""}
                      onChange={(e) => onRegime(y, (e.target.value as Regime | "") || null)}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[11px] border bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold))]",
                        r ? "border-zinc-300 text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-700"
                      )}
                    >
                      <option value="">-</option>
                      <option value="IR">IR</option>
                      <option value="IS">IS</option>
                    </select>
                  </td>
                );
              })}
            </tr>

            {/* Régime TVA */}
            <tr className="border-t bg-amber-50/30">
              <td className="sticky left-0 z-10 bg-amber-50/30 px-3 py-2 border-r font-medium">Régime TVA</td>
              {years.map((y) => {
                const before = isBeforeDebut(y);
                if (before) {
                  return (
                    <td key={y} className="px-1 py-1 text-center align-middle bg-zinc-100 text-zinc-400">-</td>
                  );
                }
                const m = getTva(y);
                return (
                  <td key={y} className="px-1 py-1 text-center align-middle">
                    <select
                      value={m ?? ""}
                      onChange={(e) => onTva(y, (e.target.value as TvaMode | "") || null)}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[11px] border bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold))]",
                        m ? "border-zinc-300 text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-700"
                      )}
                    >
                      <option value="">-</option>
                      {TVA_MODES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>

            {/* Toggles — style harmonisé avec la grille paramétrage (emerald + ghost preview) */}
            {SUB_ROWS.map((row) => (
              <tr
                key={row.key}
                className="border-t group/row hover:bg-amber-50/70 transition-colors"
              >
                {/* Cellule label sticky : bg-white par défaut, mais surlignée en
                    doré + gras quand on survole la ligne (sinon le bg sticky
                    écrase le hover du tr). */}
                <td
                  className={cn(
                    "sticky left-0 z-10 px-3 py-2 border-r bg-white transition-colors",
                    "group-hover/row:bg-amber-100 group-hover/row:font-semibold group-hover/row:text-zinc-900"
                  )}
                >
                  {row.label}
                </td>
                {years.map((y) => {
                  const before = isBeforeDebut(y);
                  if (before) {
                    return (
                      <td key={y} className="px-0.5 text-center align-middle bg-zinc-100 text-zinc-400">-</td>
                    );
                  }
                  const v = isActive(row.key, y);
                  const isIS = row.key === "IS_ACOMPTE" || row.key === "IS_SOLDE";
                  const disabled = isIS && getRegime(y) === "IR";
                  return (
                    <td key={y} className={cn("px-0.5 text-center align-middle", isYearInDraft(y) && "bg-[hsl(var(--gold))]/5")}>
                      <button
                        disabled={disabled}
                        onClick={() => onToggle(row.key, y)}
                        className={cn(
                          "w-7 h-7 inline-flex items-center justify-center rounded border",
                          "active:scale-95 group/cell relative overflow-hidden transition-transform duration-100",
                          disabled
                            ? "border-zinc-200 bg-zinc-50 cursor-not-allowed"
                            : "border-zinc-200 bg-white"
                        )}
                        title={disabled ? "Désactivé en régime IR" : v ? "Désactiver" : "Activer"}
                      >
                        {disabled ? (
                          v && <span className="text-[12px] text-zinc-300 leading-none">✓</span>
                        ) : (
                          <span
                            className={cn(
                              "absolute inset-0 inline-flex items-center justify-center",
                              "bg-emerald-500/95 text-white transition-opacity duration-100",
                              v
                                ? "opacity-100"
                                : "opacity-0 group-hover/cell:opacity-60"
                            )}
                          >
                            <span className="text-[13px] font-bold leading-none">✓</span>
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
