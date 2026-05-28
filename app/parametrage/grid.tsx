"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";
import {
  bulkDeactivateAll,
  bulkReconduire,
  bulkSetSubActive,
  setRegimeAction,
  setSubActive,
  setTva,
} from "./actions";
import { useAlert, useConfirm } from "@/app/_components/confirm-modal";

type SubKey =
  | "TVS" | "IS_ACOMPTE" | "IS_SOLDE" | "CVAE" | "CVAE_ACOMPTE"
  | "DAS2" | "DECL_2561" | "DECL_2777" | "OSS" | "DES"
  | "LIASSE_PLAQUETTE" | "AGO_DEPOT";

type TvaMode = "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS";

export type Row = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  groupe: string | null;
  regime: "IR" | "IS" | null;
  tvaMode: TvaMode | null;
  /** Année de "Prise en charge" (debut_obligations) - années antérieures grisées "-" */
  debutYear: number | null;
  subs: Record<SubKey, boolean>;
};

// Liste des colonnes à afficher (ordre métier MOON Expertise).
// Bilan annuel d'abord, puis IS, puis autres taxes, puis déclarations.
// CVAE solde retiré : toujours vérifié manuellement. CFE jamais exposée.
// IS Acomptes retiré : auto-activé pour tout dossier en régime IS.
const COLS: { key: SubKey; label: string; short: string }[] = [
  { key: "LIASSE_PLAQUETTE", label: "Liasse / Plaquette", short: "Liasse" },
  { key: "DAS2", label: "DAS2", short: "DAS2" },
  { key: "AGO_DEPOT", label: "AGO / dépôt", short: "AGO" },
  { key: "IS_SOLDE", label: "IS - Solde", short: "IS Sld" },
  { key: "TVS", label: "TVS", short: "TVS" },
  { key: "CVAE_ACOMPTE", label: "CVAE - Acomptes", short: "CV Acpt" },
  { key: "DECL_2777", label: "Flat-tax 2777", short: "2777" },
  { key: "DECL_2561", label: "IFU 2561", short: "2561" },
  { key: "OSS", label: "OSS (Guichet unique)", short: "OSS" },
  { key: "DES", label: "DES", short: "DES" },
];

const TVA_LABELS: Record<TvaMode | "", string> = {
  TVA_MENSUELLE: "Mensuelle",
  TVA_TRIMESTRIELLE: "Trimestrielle",
  TVA_ANNUELLE_CA12: "Annuelle",
  TVA_NON_SOUMIS: "Non soumis",
  "": "-",
};

export default function ParametrageGrid({ rows, year }: { rows: Row[]; year: number }) {
  const [search, setSearch] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [regimeFilter, setRegimeFilter] = useState<Set<"IR" | "IS" | "none">>(new Set());
  const [tvaFilter, setTvaFilter] = useState<Set<TvaMode | "none">>(new Set());
  const [colMenu, setColMenu] = useState<SubKey | null>(null);
  // Perf : on évite un state React pour la colonne survolée (provoquait
  // un re-render de TOUTES les cellules à chaque mouvement de souris).
  // À la place, on mute directement les classes du <th> et des <td> via
  // querySelectorAll lors du mouseenter/leave d'une cellule.
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const currentHoverColRef = useRef<SubKey | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();
  const { alert, AlertDialog } = useAlert();

  function setHoverCol(key: SubKey | null) {
    const prev = currentHoverColRef.current;
    if (prev === key) return;
    if (prev) {
      const th = theadRef.current?.querySelector(`th[data-col="${prev}"]`);
      th?.classList.remove("bg-[hsl(var(--gold))]/15", "text-[hsl(var(--gold-dark))]");
      tbodyRef.current
        ?.querySelectorAll(`td[data-col="${prev}"]`)
        .forEach((el) => el.classList.remove("bg-[hsl(var(--gold))]/5"));
    }
    if (key) {
      const th = theadRef.current?.querySelector(`th[data-col="${key}"]`);
      th?.classList.add("bg-[hsl(var(--gold))]/15", "text-[hsl(var(--gold-dark))]");
      tbodyRef.current
        ?.querySelectorAll(`td[data-col="${key}"]:not([data-sel="1"])`)
        .forEach((el) => el.classList.add("bg-[hsl(var(--gold))]/5"));
    }
    currentHoverColRef.current = key;
  }

  // State local + sync via prop. useOptimistic ne joue pas bien avec
  // router.refresh() (revert à la fin de la transition). Le state local
  // reste correct ; le useEffect re-sync quand le serveur retourne.
  type Patch =
    | { kind: "sub"; clientId: string; key: SubKey; active: boolean }
    | { kind: "tva"; clientId: string; mode: TvaMode | null }
    | { kind: "regime"; clientId: string; regime: "IR" | "IS" | null };
  const [localRows, setLocalRows] = useState<Row[]>(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  function applyPatch(p: Patch) {
    setLocalRows((state) =>
      state.map((r) => {
        if (r.id !== p.clientId) return r;
        if (p.kind === "sub") {
          return { ...r, subs: { ...r.subs, [p.key]: p.active } };
        }
        if (p.kind === "tva") {
          return { ...r, tvaMode: p.mode };
        }
        if (p.kind === "regime") {
          const next: Row = { ...r, regime: p.regime };
          if (p.regime === "IR") {
            next.subs = { ...r.subs, IS_ACOMPTE: false, IS_SOLDE: false };
          } else if (p.regime === "IS") {
            next.subs = { ...r.subs, IS_SOLDE: true };
          }
          return next;
        }
        return r;
      })
    );
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const hasRegime = regimeFilter.size > 0;
    const hasTva = tvaFilter.size > 0;
    return localRows.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""} ${r.groupe ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (hasRegime) {
        const key = (r.regime ?? "none") as "IR" | "IS" | "none";
        if (!regimeFilter.has(key)) return false;
      }
      if (hasTva) {
        const key = (r.tvaMode ?? "none") as TvaMode | "none";
        if (!tvaFilter.has(key)) return false;
      }
      return true;
    });
  }, [localRows, search, regimeFilter, tvaFilter]);

  function toggleRegime(v: "IR" | "IS" | "none") {
    setRegimeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }
  function toggleTva(v: TvaMode | "none") {
    setTvaFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function bulkColumn(key: SubKey, active: boolean) {
    const ids = filtered.map((r) => r.id);
    if (!ids.length) return;
    for (const id of ids) applyPatch({ kind: "sub", clientId: id, key, active });
    setColMenu(null);
    startTransition(async () => {
      await bulkSetSubActive(ids, key, year, active);
      router.refresh();
    });
  }

  function toggleRowSelection(id: string, e: React.MouseEvent) {
    if (e.shiftKey && anchor) {
      const ids = filtered.map((r) => r.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const next = new Set<string>();
        for (let i = lo; i <= hi; i++) next.add(ids[i]);
        setSelectedClientIds(next);
        return;
      }
    }
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  }

  function selectAll() {
    setSelectedClientIds(new Set(filtered.map((r) => r.id)));
  }
  function clearSel() {
    setSelectedClientIds(new Set());
    setAnchor(null);
  }

  // Ctrl/Cmd + Shift + L = défiltre tout (style Excel)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setSearch("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onToggleSub(clientId: string, key: SubKey, current: boolean) {
    applyPatch({ kind: "sub", clientId, key, active: !current });
    startTransition(async () => {
      await setSubActive(clientId, key, year, !current);
      router.refresh();
    });
  }

  function onChangeTva(clientId: string, mode: TvaMode | "") {
    const nextMode = (mode || null) as TvaMode | null;
    applyPatch({ kind: "tva", clientId, mode: nextMode });
    startTransition(async () => {
      await setTva(clientId, year, nextMode);
      router.refresh();
    });
  }

  function onChangeRegime(clientId: string, r: "IR" | "IS" | "") {
    const nextRegime = (r || null) as "IR" | "IS" | null;
    applyPatch({ kind: "regime", clientId, regime: nextRegime });
    startTransition(async () => {
      await setRegimeAction(clientId, year, nextRegime);
      router.refresh();
    });
  }

  function bulkApply(key: SubKey, active: boolean) {
    if (!selectedClientIds.size) return;
    const ids = [...selectedClientIds];
    for (const id of ids) applyPatch({ kind: "sub", clientId: id, key, active });
    startTransition(async () => {
      await bulkSetSubActive(ids, key, year, active);
      router.refresh();
    });
  }

  async function reconduire() {
    if (!selectedClientIds.size) return;
    const n = selectedClientIds.size;
    const ok = await confirm({
      title: `Reconduire ${year} vers ${year + 1} ?`,
      description: `${n} dossier${n > 1 ? "s" : ""} sélectionné${n > 1 ? "s" : ""}. Les obligations actives seront recréées sur l'année suivante.`,
      confirmLabel: "Reconduire",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await bulkReconduire([...selectedClientIds], year, year + 1);
      router.refresh();
      await alert({
        title: `Reconduction effectuée`,
        description: `${res.created} subscription${res.created > 1 ? "s" : ""} reconduite${res.created > 1 ? "s" : ""} vers ${year + 1}.`,
      });
    });
  }

  async function reconduireOne(clientId: string) {
    const ok = await confirm({
      title: `Reconduire ${year} vers ${year + 1} ?`,
      description: "Pour ce dossier uniquement.",
      confirmLabel: "Reconduire",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await bulkReconduire([clientId], year, year + 1);
      router.refresh();
      if (res.created === 0) {
        await alert({
          title: "Rien à reconduire",
          description: `Le dossier est déjà à jour, ou n'a aucune obligation active en ${year}.`,
        });
      }
    });
  }

  async function reconduireAll() {
    const ids = filtered.map((r) => r.id);
    if (!ids.length) return;
    const ok = await confirm({
      title: `Reconduire ${year} vers ${year + 1} ?`,
      description: `TOUS les ${ids.length} dossiers affichés seront reconduits.`,
      confirmLabel: "Reconduire tout",
      variant: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await bulkReconduire(ids, year, year + 1);
      router.refresh();
      await alert({
        title: "Reconduction effectuée",
        description: `${res.created} subscription${res.created > 1 ? "s" : ""} reconduite${res.created > 1 ? "s" : ""} vers ${year + 1}.`,
      });
    });
  }

  async function decocheAll() {
    if (!selectedClientIds.size) return;
    const n = selectedClientIds.size;
    const ok = await confirm({
      title: `Désactiver toutes les obligations ${year} ?`,
      description: `Pour ${n} client${n > 1 ? "s" : ""} sélectionné${n > 1 ? "s" : ""}. L'historique d'échéances est conservé, tu peux réactiver à tout moment.`,
      confirmLabel: "Désactiver",
      variant: "danger",
    });
    if (!ok) return;
    const ids = [...selectedClientIds];
    // Patch local immédiat : toutes les cellules de ces clients passent à false
    const allKeys = COLS.map((c) => c.key);
    for (const id of ids) {
      for (const k of allKeys) applyPatch({ kind: "sub", clientId: id, key: k, active: false });
    }
    startTransition(async () => {
      await bulkDeactivateAll(ids, year);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {ConfirmDialog}
      {AlertDialog}
      {/* Toolbar */}
      <div className="rounded-lg border bg-card px-3 py-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Filtrer par client, SIREN, groupe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={reconduireAll}
              className="px-2.5 py-1 rounded-md text-xs border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] hover:bg-[hsl(var(--gold))]/20 transition"
              title={`Reconduire la conf ${year} vers ${year + 1} pour tous les dossiers affichés`}
            >
              Reconduire tout vers {year + 1} ›
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} client{filtered.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 mr-1">Régime :</span>
            {(["IR", "IS", "none"] as const).map((v) => (
              <button
                key={v}
                onClick={() => toggleRegime(v)}
                className={cn(
                  "px-2 py-0.5 rounded-md border transition-all duration-150 active:scale-95",
                  regimeFilter.has(v)
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40"
                    : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700"
                )}
              >
                {v === "none" ? "Non paramétré" : v}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-zinc-200" />
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-zinc-500 mr-1">TVA :</span>
            {(["TVA_MENSUELLE", "TVA_TRIMESTRIELLE", "TVA_ANNUELLE_CA12", "TVA_NON_SOUMIS", "none"] as const).map((v) => (
              <button
                key={v}
                onClick={() => toggleTva(v)}
                className={cn(
                  "px-2 py-0.5 rounded-md border transition-all duration-150 active:scale-95",
                  tvaFilter.has(v)
                    ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40"
                    : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700"
                )}
              >
                {v === "none" ? "Non paramétré" : v === "TVA_MENSUELLE" ? "Mensuelle" : v === "TVA_TRIMESTRIELLE" ? "Trimestrielle" : v === "TVA_ANNUELLE_CA12" ? "Annuelle" : "Non soumis"}
              </button>
            ))}
          </div>
          {(regimeFilter.size > 0 || tvaFilter.size > 0) && (
            <button
              onClick={() => { setRegimeFilter(new Set()); setTvaFilter(new Set()); }}
              className="text-zinc-500 hover:text-zinc-900 underline"
            >
              vider
            </button>
          )}
        </div>
      </div>

      {/* Table - l'entête se fige en haut quand on scrolle */}
      <div className="rounded-lg border overflow-auto bg-card max-h-[calc(100vh-270px)]">
        <table className="w-full text-sm border-collapse">
          <thead ref={theadRef} className="bg-zinc-50 text-zinc-700 text-xs border-b border-zinc-200 sticky top-0 z-20 shadow-[0_1px_0_0_rgb(228_228_231)]">
            <tr>
              <th className="sticky left-0 z-30 bg-zinc-50 text-left px-0 py-0 font-medium border-r border-zinc-200 min-w-[240px]">
                <button
                  onClick={selectAll}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[hsl(var(--gold))]/10 transition-colors group/all"
                  title="Tout sélectionner"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-zinc-300 bg-white text-zinc-400 group-hover/all:border-[hsl(var(--gold))] group-hover/all:text-[hsl(var(--gold))] transition-colors">
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor" aria-hidden>
                      <rect x="1" y="1" width="6" height="6" rx="1" />
                      <rect x="9" y="1" width="6" height="6" rx="1" />
                      <rect x="1" y="9" width="6" height="6" rx="1" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                    </svg>
                  </span>
                  <span>Client</span>
                </button>
              </th>
              <th className="px-2 py-2 font-medium text-center min-w-[80px] border-r border-zinc-200">Régime</th>
              <th className="px-2 py-2 font-medium text-center min-w-[110px] border-r border-zinc-200">TVA</th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  data-col={c.key}
                  className="px-0 py-0 font-medium text-center min-w-[64px] relative transition-colors duration-100"
                >
                  <button
                    onClick={() => setColMenu(colMenu === c.key ? null : c.key)}
                    className={cn(
                      "w-full px-1 py-2 hover:bg-[hsl(var(--gold))]/10 transition-colors",
                      colMenu === c.key && "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))]"
                    )}
                    title={`Activer/désactiver "${c.label}" pour tous les clients filtrés`}
                  >
                    {c.short}
                  </button>
                  {colMenu === c.key && (
                    <div className="absolute z-30 top-full mt-1 left-1/2 -translate-x-1/2 bg-white border rounded-lg shadow-xl py-1 min-w-[180px] text-left animate-slide-up-fade">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500 border-b">
                        {c.label} · {filtered.length} client{filtered.length > 1 ? "s" : ""}
                      </div>
                      <button
                        onClick={() => bulkColumn(c.key, true)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 text-emerald-800 flex items-center gap-2"
                      >
                        <span className="text-base">✓</span> Activer pour tous
                      </button>
                      <button
                        onClick={() => bulkColumn(c.key, false)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-rose-50 text-rose-800 flex items-center gap-2"
                      >
                        <span className="text-base">✗</span> Désactiver pour tous
                      </button>
                      <button
                        onClick={() => setColMenu(null)}
                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 border-t mt-1"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 font-medium text-center min-w-[80px] text-zinc-500 border-l border-zinc-200">
                {year + 1}
              </th>
            </tr>
          </thead>
          <tbody ref={tbodyRef} onMouseLeave={() => setHoverCol(null)}>
            {filtered.map((r) => {
              const isSel = selectedClientIds.has(r.id);
              const isIR = r.regime === "IR";
              // Dossier pas encore "pris en charge" pour cette année (année < debut_obligations)
              const beforeDebut = r.debutYear !== null && year < r.debutYear;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t transition-colors group/row",
                    isSel
                      ? "bg-[hsl(var(--gold))]/10"
                      : beforeDebut
                      ? "bg-zinc-100/60"
                      : "hover:bg-amber-50/70"
                  )}
                >
                  <td className="sticky left-0 z-10 bg-inherit border-r border-zinc-200">
                    <div className="flex items-center">
                      <button
                        onClick={(e) => toggleRowSelection(r.id, e)}
                        className={cn(
                          "w-7 shrink-0 flex items-center justify-center py-2 transition-colors",
                          isSel
                            ? "text-[hsl(var(--gold))]"
                            : "text-zinc-300 hover:text-zinc-500"
                        )}
                        title={isSel ? "Désélectionner" : "Sélectionner la ligne"}
                      >
                        <span className="text-xs">{isSel ? "■" : "□"}</span>
                      </button>
                      <div className="flex-1 px-2 py-2 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            href={`/clients/${r.slug}`}
                            className="font-medium truncate no-underline hover:text-[hsl(var(--gold))] transition-colors"
                          >
                            {r.denomination}
                          </Link>
                          <PappersInpiBadges siren={r.siren} size="xs" />
                        </div>
                        {(r.siren || r.groupe) && (
                          <Link
                            href={`/clients/${r.slug}`}
                            className="block text-xs text-muted-foreground truncate no-underline hover:text-[hsl(var(--gold))] transition-colors"
                          >
                            {r.siren && <span className="tabular-nums">{r.siren}</span>}
                            {r.siren && r.groupe && <span> · </span>}
                            {r.groupe}
                          </Link>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-1 text-center align-middle border-r border-zinc-200">
                    {beforeDebut ? (
                      <span className="text-zinc-400 text-sm">-</span>
                    ) : (
                      <select
                        value={r.regime ?? ""}
                        onChange={(e) => onChangeRegime(r.id, e.target.value as "IR" | "IS" | "")}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[11px] border bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold))]",
                          r.regime ? "border-zinc-300 text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        <option value="">-</option>
                        <option value="IR">IR</option>
                        <option value="IS">IS</option>
                      </select>
                    )}
                  </td>
                  <td className="px-1 text-center align-middle border-r border-zinc-200">
                    {beforeDebut ? (
                      <span className="text-zinc-400 text-sm">-</span>
                    ) : (
                      <select
                        value={r.tvaMode ?? ""}
                        onChange={(e) => onChangeTva(r.id, e.target.value as TvaMode | "")}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[11px] border bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold))]",
                          r.tvaMode ? "border-zinc-300 text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        <option value="">-</option>
                        <option value="TVA_MENSUELLE">Mensuelle</option>
                        <option value="TVA_TRIMESTRIELLE">Trimestrielle</option>
                        <option value="TVA_ANNUELLE_CA12">Annuelle</option>
                        <option value="TVA_NON_SOUMIS">Non soumis</option>
                      </select>
                    )}
                  </td>
                  {COLS.map((col) => {
                    if (beforeDebut) {
                      return (
                        <td
                          key={col.key}
                          className="px-0.5 py-1 text-center align-middle text-zinc-400 text-sm"
                        >
                          -
                        </td>
                      );
                    }
                    const isIS = col.key === "IS_ACOMPTE" || col.key === "IS_SOLDE";
                    const disabled = isIR && isIS;
                    const v = r.subs[col.key];
                    return (
                      <td
                        key={col.key}
                        data-col={col.key}
                        data-sel={isSel ? "1" : "0"}
                        onMouseEnter={() => setHoverCol(col.key)}
                        className="px-0.5 py-1 text-center align-middle transition-colors duration-100"
                      >
                        <button
                          disabled={disabled}
                          onClick={() => onToggleSub(r.id, col.key, v)}
                          className={cn(
                            "w-7 h-7 inline-flex items-center justify-center rounded border",
                            "active:scale-95 group/cell relative overflow-hidden transition-transform duration-100",
                            disabled
                              ? "border-zinc-200 bg-zinc-50 cursor-not-allowed"
                              : "border-zinc-200 bg-white"
                          )}
                          title={
                            disabled
                              ? "Désactivé en régime IR"
                              : v
                              ? "Désactiver"
                              : "Activer"
                          }
                        >
                          {disabled ? (
                            v && <span className="text-[12px] text-zinc-300 leading-none">✓</span>
                          ) : (
                            // Calque unique style "actif" - opacité 100 si actif, 60% au survol sinon
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
                  <td className="px-2 text-center align-middle border-l border-zinc-200">
                    {beforeDebut ? (
                      <span className="text-zinc-400 text-sm">-</span>
                    ) : (
                      <button
                        onClick={() => reconduireOne(r.id)}
                        className="px-2 py-1 rounded-md text-[11px] border border-[hsl(var(--gold))]/30 bg-white text-[hsl(var(--gold-dark))] hover:bg-[hsl(var(--gold))]/10 hover:border-[hsl(var(--gold))]/60 transition"
                        title={`Reconduire ce dossier vers ${year + 1}`}
                      >
                        {year + 1} ›
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={COLS.length + 4} className="px-3 py-8 text-center text-muted-foreground">
                  Aucun client.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'actions bulk */}
      {selectedClientIds.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto max-w-5xl animate-slide-up-fade">
          <div className="rounded-xl bg-[#0D1122] dark:bg-[hsl(var(--surface-elevated))] text-white shadow-2xl ring-1 ring-white/10 dark:ring-white/[0.18]">
            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-white/10">
              <div className="text-sm font-medium">
                {selectedClientIds.size} client{selectedClientIds.size > 1 ? "s" : ""} sélectionné{selectedClientIds.size > 1 ? "s" : ""}
              </div>
              <button
                onClick={reconduire}
                className="text-xs px-2.5 py-1 rounded-md bg-[hsl(var(--gold))] text-white hover:opacity-90 transition font-medium"
                title={`Reconduire la conf vers ${year + 1}`}
              >
                Reconduire vers {year + 1}
              </button>
              <button
                onClick={decocheAll}
                className="text-xs px-2.5 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition"
                title={`Décocher toutes les obligations ${year} pour la sélection`}
              >
                Tout décocher
              </button>
              <div className="ml-auto">
                <button
                  onClick={clearSel}
                  className="text-xs px-2.5 py-1 rounded-md text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  Vider ✕
                </button>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-1.5 items-center">
              <div className="text-xs text-zinc-400 mr-1">Activer en masse :</div>
              {COLS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => bulkApply(c.key, true)}
                  className="px-2 py-0.5 rounded text-[11px] border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition"
                  title={`Activer ${c.label} pour les ${selectedClientIds.size} client(s) sélectionné(s)`}
                >
                  + {c.short}
                </button>
              ))}
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-1.5 items-center border-t border-white/5">
              <div className="text-xs text-zinc-400 mr-1">Désactiver :</div>
              {COLS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => bulkApply(c.key, false)}
                  className="px-2 py-0.5 rounded text-[11px] border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition"
                  title={`Désactiver ${c.label} pour les ${selectedClientIds.size} client(s) sélectionné(s)`}
                >
                  − {c.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
