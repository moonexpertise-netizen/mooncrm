"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
  ExternalLink,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

// ============================================================================
// Types (cf. page.tsx pour la construction)
// ============================================================================

export type ProjectionContrib = {
  source: string;
  label: string;
  montant: number;
  href: string;
  bucket: "facturable" | "recurrent" | "ponctuel" | "pondere";
};

export type MonthCell = {
  key: string;
  label: string;
  facturable: number;
  recurrent: number;
  ponctuel: number;
  pondere: number;
  total: number;
  contribs: ProjectionContrib[];
};

export type WaterfallStage = {
  stade: string;
  ponderation: number;
  count: number;
  arrBrut: number;
  arrPondere: number;
  clients: { id: string; slug: string; denomination: string; arrBrut: number; arrPondere: number }[];
};

export type WhatIfData = {
  arrSigne: number;
  arrMoyenSigne: number;
  nbSignes: number;
  cashMobilisable: number;
  cashMobilisableCount: number;
  stade5: { count: number; arrBrut: number; arrPondere: number; clients: WaterfallStage["clients"] };
  stade6: { count: number; arrBrut: number; arrPondere: number; clients: WaterfallStage["clients"] };
  top1Arr: number;
  top3Arr: number;
  top5Arr: number;
  top1Pct: number;
  top3Pct: number;
  top5Pct: number;
  targetArrGrowth: number;
  nbSignaturesNeeded: number;
  targetMoisGrowth: number;
};

export type SurveilItem = {
  type: "stade_6_stagne" | "stade_4_stagne" | "mex_non_facturee";
  severity: "high" | "medium";
  title: string;
  detail: string;
  ageDays: number;
  montant: number;
  href: string;
};

export type FinanceData = {
  monthly: MonthCell[];
  waterfall: WaterfallStage[];
  totalArrBrut: number;
  totalArrPondere: number;
  whatIf: WhatIfData;
  surveil: SurveilItem[];
};

// ============================================================================
// Couleurs categories projection (palette neutre, distincte de la semantique)
// ============================================================================

const BUCKET_COLORS = {
  facturable: { hex: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-500/30", label: "À facturer" },
  recurrent: { hex: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-500/30", label: "Récurrent signé" },
  ponctuel: { hex: "#14b8a6", bg: "bg-teal-50 dark:bg-teal-500/15", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-500/30", label: "Ponctuel signé" },
  pondere: { hex: "#6366f1", bg: "bg-indigo-50 dark:bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-500/30", label: "Pondéré pipeline" },
} as const;

// ============================================================================
// Formatters
// ============================================================================

function formatEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " € HT";
}

function formatKEUR(n: number): string {
  if (Math.abs(n) >= 10000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n / 1000)) + " k€";
  }
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k€";
  }
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €";
}

// ============================================================================
// Composant principal
// ============================================================================

export default function FinanceDashboard({ data }: { data: FinanceData }) {
  const [drawerMonth, setDrawerMonth] = useState<MonthCell | null>(null);
  const [drawerWaterfall, setDrawerWaterfall] = useState<WaterfallStage | null>(null);
  const [drawerClients, setDrawerClients] = useState<{ title: string; subtitle?: string; clients: WaterfallStage["clients"] } | null>(null);

  return (
    <div className="space-y-6">
      {/* Hero : projection cash 12 mois */}
      <ProjectionCard monthly={data.monthly} onMonthClick={setDrawerMonth} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <WaterfallCard
          waterfall={data.waterfall}
          totalBrut={data.totalArrBrut}
          totalPondere={data.totalArrPondere}
          onStageClick={setDrawerWaterfall}
        />
        <WhatIfCard
          whatIf={data.whatIf}
          onShowClients={setDrawerClients}
        />
      </div>

      <SurveilCard items={data.surveil} />

      {/* Drawers */}
      {drawerMonth && (
        <Drawer
          title={`${drawerMonth.label} · ${formatEUR(drawerMonth.total)}`}
          subtitle={`${drawerMonth.contribs.length} ligne${drawerMonth.contribs.length > 1 ? "s" : ""} contributrice${drawerMonth.contribs.length > 1 ? "s" : ""}`}
          onClose={() => setDrawerMonth(null)}
        >
          <MonthDrawerContent month={drawerMonth} />
        </Drawer>
      )}
      {drawerWaterfall && (
        <Drawer
          title={drawerWaterfall.stade}
          subtitle={`${drawerWaterfall.count} dossier${drawerWaterfall.count > 1 ? "s" : ""} · ARR brut ${formatEUR(drawerWaterfall.arrBrut)} · pondéré ${formatEUR(drawerWaterfall.arrPondere)}`}
          onClose={() => setDrawerWaterfall(null)}
        >
          <ClientList clients={drawerWaterfall.clients} />
        </Drawer>
      )}
      {drawerClients && (
        <Drawer
          title={drawerClients.title}
          subtitle={drawerClients.subtitle}
          onClose={() => setDrawerClients(null)}
        >
          <ClientList clients={drawerClients.clients} />
        </Drawer>
      )}
    </div>
  );
}

// ============================================================================
// 1. PROJECTION CASH 12 MOIS
// ============================================================================

function ProjectionCard({
  monthly,
  onMonthClick,
}: {
  monthly: MonthCell[];
  onMonthClick: (m: MonthCell) => void;
}) {
  const chartData = monthly.map((m) => ({
    key: m.key,
    label: m.label,
    facturable: m.facturable,
    recurrent: m.recurrent,
    ponctuel: m.ponctuel,
    pondere: m.pondere,
    total: m.total,
  }));

  const totalProj = monthly.reduce((s, m) => s + m.total, 0);
  const totalFacturable = monthly.reduce((s, m) => s + m.facturable, 0);
  const totalRecurrent = monthly.reduce((s, m) => s + m.recurrent, 0);
  const totalPondere = monthly.reduce((s, m) => s + m.pondere, 0);

  // Garde le mois selectionne pour highlight
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            Projection cash · 12 mois
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cliquez sur un mois pour voir les dossiers qui contribuent · le pondéré pipeline est étalé selon une date prévisionnelle par stade
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total 12 mois</div>
            <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatEUR(totalProj)}</div>
          </div>
        </div>
      </div>

      {/* Legende + totaux par bucket */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <LegendItem bucket="facturable" total={totalFacturable} />
        <LegendItem bucket="recurrent" total={totalRecurrent} />
        <LegendItem bucket="pondere" total={totalPondere} />
        <LegendItem bucket="ponctuel" total={monthly.reduce((s, m) => s + m.ponctuel, 0)} />
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
            onMouseMove={(e) => {
              if (typeof e.activeTooltipIndex === "number") setHoverIdx(e.activeTooltipIndex);
            }}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={(e) => {
              if (typeof e?.activeTooltipIndex === "number") {
                onMonthClick(monthly[e.activeTooltipIndex]);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-white/[0.06]" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-zinc-500 dark:text-zinc-400"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatKEUR(v)}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-zinc-500 dark:text-zinc-400"
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as MonthCell | undefined;
                if (!d) return null;
                return (
                  <div className="rounded-lg bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] shadow-lg px-3 py-2 text-xs space-y-1">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">{label}</div>
                    {(["facturable", "recurrent", "ponctuel", "pondere"] as const).map((b) => {
                      const v = d[b];
                      if (v <= 0) return null;
                      return (
                        <div key={b} className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: BUCKET_COLORS[b].hex }} />
                          <span className="text-zinc-600 dark:text-zinc-400">{BUCKET_COLORS[b].label}</span>
                          <span className="ml-auto tabular-nums text-zinc-900 dark:text-zinc-100 font-medium">{formatEUR(v)}</span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 pt-1 mt-1 border-t border-zinc-100 dark:border-white/[0.06]">
                      <span className="text-zinc-700 dark:text-zinc-200 font-semibold">Total</span>
                      <span className="ml-auto tabular-nums text-zinc-900 dark:text-zinc-100 font-semibold">{formatEUR(d.total)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 italic">Cliquez pour voir le détail</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="facturable" stackId="a" fill={BUCKET_COLORS.facturable.hex} cursor="pointer" radius={[0, 0, 0, 0]} />
            <Bar dataKey="recurrent" stackId="a" fill={BUCKET_COLORS.recurrent.hex} cursor="pointer" />
            <Bar dataKey="ponctuel" stackId="a" fill={BUCKET_COLORS.ponctuel.hex} cursor="pointer" />
            <Bar dataKey="pondere" stackId="a" fill={BUCKET_COLORS.pondere.hex} cursor="pointer" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fillOpacity={hoverIdx === null || hoverIdx === i ? 1 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendItem({ bucket, total }: { bucket: keyof typeof BUCKET_COLORS; total: number }) {
  const cls = BUCKET_COLORS[bucket];
  return (
    <div className={cn("rounded-lg border px-3 py-2", cls.border, cls.bg)}>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: cls.hex }} />
        <span className={cn("text-[10px] uppercase tracking-wide font-medium", cls.text)}>{cls.label}</span>
      </div>
      <div className={cn("text-base font-semibold tabular-nums mt-0.5", cls.text)}>{formatKEUR(total)}</div>
    </div>
  );
}

function MonthDrawerContent({ month }: { month: MonthCell }) {
  // Regroupe les contribs par bucket
  const buckets = useMemo(() => {
    const m = new Map<string, ProjectionContrib[]>();
    for (const c of month.contribs) {
      const arr = m.get(c.bucket) ?? [];
      arr.push(c);
      m.set(c.bucket, arr);
    }
    return m;
  }, [month.contribs]);

  if (month.contribs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-zinc-400 italic">
        Aucun cash projeté ce mois.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(["facturable", "recurrent", "ponctuel", "pondere"] as const).map((b) => {
        const items = buckets.get(b);
        if (!items || items.length === 0) return null;
        const cls = BUCKET_COLORS[b];
        const total = items.reduce((s, i) => s + i.montant, 0);
        return (
          <div key={b}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: cls.hex }} />
                <span className={cn("text-xs font-semibold uppercase tracking-wide", cls.text)}>{cls.label}</span>
                <span className="text-[10px] text-zinc-400">· {items.length}</span>
              </div>
              <span className={cn("text-sm font-semibold tabular-nums", cls.text)}>{formatEUR(total)}</span>
            </div>
            <ul className="space-y-1">
              {items.map((c, i) => (
                <li key={i}>
                  <Link
                    href={c.href}
                    className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-800 dark:text-zinc-200 truncate group-hover:text-zinc-900 dark:group-hover:text-zinc-50">
                        {c.label}
                      </div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{c.source}</div>
                    </div>
                    <div className="text-sm tabular-nums font-medium text-zinc-700 dark:text-zinc-300 shrink-0">
                      {formatEUR(c.montant)}
                    </div>
                    <ExternalLink className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// 2. WATERFALL PIPELINE
// ============================================================================

function WaterfallCard({
  waterfall,
  totalBrut,
  totalPondere,
  onStageClick,
}: {
  waterfall: WaterfallStage[];
  totalBrut: number;
  totalPondere: number;
  onStageClick: (s: WaterfallStage) => void;
}) {
  const stages = [...waterfall].reverse(); // affiche du plus avance au plus eloigne
  const maxBrut = Math.max(...waterfall.map((w) => w.arrBrut), 1);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-400" />
            Pipeline pondéré · par stade
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            ARR brut total → pondéré par probabilité de signature · cliquez un stade pour le détail
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Pondéré net</div>
          <div className="text-lg font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">{formatEUR(totalPondere)}</div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">brut {formatKEUR(totalBrut)}</div>
        </div>
      </div>

      {stages.every((s) => s.count === 0) ? (
        <div className="text-center py-8 text-sm text-zinc-400 italic">
          Aucun prospect en cours.
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((s) => {
            const pctBrut = (s.arrBrut / maxBrut) * 100;
            const pctPondere = s.arrBrut > 0 ? (s.arrPondere / s.arrBrut) * 100 : 0;
            const disabled = s.count === 0;
            return (
              <button
                key={s.stade}
                type="button"
                onClick={() => !disabled && onStageClick(s)}
                disabled={disabled}
                className={cn(
                  "w-full text-left rounded-lg border border-zinc-200 dark:border-white/[0.08] p-3 transition-colors",
                  disabled
                    ? "bg-zinc-50/40 dark:bg-white/[0.01] opacity-60 cursor-default"
                    : "bg-zinc-50/50 dark:bg-white/[0.02] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] cursor-pointer"
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{s.stade}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">{s.count} dossier{s.count > 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                    <span className="text-zinc-500 dark:text-zinc-400">{formatKEUR(s.arrBrut)}</span>
                    <ArrowRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
                    <span className="font-semibold text-indigo-700 dark:text-indigo-300">{formatKEUR(s.arrPondere)}</span>
                  </div>
                </div>
                <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-white/[0.04] overflow-hidden">
                  {/* Brut */}
                  <div
                    className="absolute inset-y-0 left-0 bg-zinc-200 dark:bg-white/[0.08]"
                    style={{ width: `${pctBrut}%` }}
                  />
                  {/* Pondéré (overlay) */}
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-500 dark:bg-indigo-400"
                    style={{ width: `${pctBrut * (pctPondere / 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Pondération {(s.ponderation * 100).toFixed(0)} % · {(pctPondere).toFixed(0)} % du brut conservé
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. WHAT-IF
// ============================================================================

function WhatIfCard({
  whatIf,
  onShowClients,
}: {
  whatIf: WhatIfData;
  onShowClients: (d: { title: string; subtitle?: string; clients: WaterfallStage["clients"] }) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-zinc-400" />
            What-if · leviers
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Scénarios pour décider où concentrer les efforts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. Convertir stade 6 */}
        <WhatIfTile
          icon={<Target className="h-4 w-4" />}
          accent="emerald"
          label="Si je signe tout mon stade 6"
          delta={`+${formatKEUR(whatIf.stade6.arrBrut - whatIf.stade6.arrPondere)}`}
          subtitle={`${whatIf.stade6.count} dossier${whatIf.stade6.count > 1 ? "s" : ""} · brut ${formatKEUR(whatIf.stade6.arrBrut)} · actuel pondéré ${formatKEUR(whatIf.stade6.arrPondere)}`}
          actionLabel={whatIf.stade6.count > 0 ? `Voir les ${whatIf.stade6.count}` : undefined}
          onAction={() => onShowClients({ title: "Stade 6 - LDM envoyée", subtitle: "Si tous signent : +ARR garanti", clients: whatIf.stade6.clients })}
        />

        {/* 2. Convertir stade 5 */}
        <WhatIfTile
          icon={<Target className="h-4 w-4" />}
          accent="sky"
          label="Si je signe tout mon stade 5"
          delta={`+${formatKEUR(whatIf.stade5.arrBrut - whatIf.stade5.arrPondere)}`}
          subtitle={`${whatIf.stade5.count} dossier${whatIf.stade5.count > 1 ? "s" : ""} · brut ${formatKEUR(whatIf.stade5.arrBrut)}`}
          actionLabel={whatIf.stade5.count > 0 ? `Voir les ${whatIf.stade5.count}` : undefined}
          onAction={() => onShowClients({ title: "Stade 5 - PC acceptée", subtitle: "Si tous signent : +ARR garanti", clients: whatIf.stade5.clients })}
        />

        {/* 3. Facturer le mobilisable */}
        <WhatIfTile
          icon={<Wallet className="h-4 w-4" />}
          accent="amber"
          label="Si je facture tout ce qui est livrable"
          delta={`+${formatKEUR(whatIf.cashMobilisable)}`}
          subtitle={`${whatIf.cashMobilisableCount} item${whatIf.cashMobilisableCount > 1 ? "s" : ""} prêt${whatIf.cashMobilisableCount > 1 ? "s" : ""} à facturer maintenant`}
          actionLabel="Voir / facturer"
          actionHref="/facturation"
        />

        {/* 4. Risque concentration */}
        <WhatIfTile
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={whatIf.top3Pct > 50 ? "amber" : "zinc"}
          label="Risque concentration"
          delta={`Top 3 = ${whatIf.top3Pct.toFixed(0)} %`}
          subtitle={`Top 1 ${formatKEUR(whatIf.top1Arr)} (${whatIf.top1Pct.toFixed(0)} %) · Top 3 ${formatKEUR(whatIf.top3Arr)} · Top 5 ${formatKEUR(whatIf.top5Arr)}`}
        />

        {/* 5. Objectif croissance */}
        <WhatIfTile
          icon={<TrendingUp className="h-4 w-4" />}
          accent="indigo"
          label="Pour +25 % d'ARR sur 12 mois"
          delta={`${whatIf.nbSignaturesNeeded} signature${whatIf.nbSignaturesNeeded > 1 ? "s" : ""}`}
          subtitle={`Cible +${formatKEUR(whatIf.targetArrGrowth)} · ARR moyen client ${formatKEUR(whatIf.arrMoyenSigne)}`}
        />

        {/* 6. ARR actuel ref */}
        <WhatIfTile
          icon={<Wallet className="h-4 w-4" />}
          accent="emerald"
          label="ARR signé actuel"
          delta={formatKEUR(whatIf.arrSigne)}
          subtitle={`${whatIf.nbSignes} dossier${whatIf.nbSignes > 1 ? "s" : ""} · MRR ${formatKEUR(whatIf.arrSigne / 12)}`}
        />
      </div>
    </div>
  );
}

function WhatIfTile({
  icon,
  accent,
  label,
  delta,
  subtitle,
  actionLabel,
  onAction,
  actionHref,
}: {
  icon: React.ReactNode;
  accent: "emerald" | "sky" | "amber" | "indigo" | "zinc";
  label: string;
  delta: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}) {
  const accentCls: Record<typeof accent, { text: string; bg: string; border: string }> = {
    emerald: { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-500/15", border: "border-emerald-200 dark:border-emerald-500/30" },
    sky: { text: "text-sky-700 dark:text-sky-300", bg: "bg-sky-50 dark:bg-sky-500/15", border: "border-sky-200 dark:border-sky-500/30" },
    amber: { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-500/15", border: "border-amber-200 dark:border-amber-500/30" },
    indigo: { text: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-500/15", border: "border-indigo-200 dark:border-indigo-500/30" },
    zinc: { text: "text-zinc-700 dark:text-zinc-300", bg: "bg-zinc-50 dark:bg-white/[0.04]", border: "border-zinc-200 dark:border-white/[0.08]" },
  };
  const cls = accentCls[accent];
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/30 dark:bg-white/[0.01] p-3 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md", cls.bg, cls.text)}>
          {icon}
        </div>
      </div>
      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium leading-tight">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums mt-1", cls.text)}>{delta}</div>
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug flex-1">{subtitle}</div>
      {actionLabel && (onAction || actionHref) && (
        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
          {actionHref ? (
            <Link
              href={actionHref}
              className="text-[11px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1"
            >
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className="text-[11px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1"
            >
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. À SURVEILLER
// ============================================================================

function SurveilCard({ items }: { items: SurveilItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 10);
  const totalMontant = items.reduce((s, i) => s + i.montant, 0);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-400" />
            À surveiller
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Deals qui stagnent · missions livrées non facturées · {items.length} item{items.length > 1 ? "s" : ""} · {formatKEUR(totalMontant)} en jeu
          </p>
        </div>
        {items.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors shrink-0"
          >
            {showAll ? "Voir top 10" : `Voir tout (${items.length})`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
          Rien à surveiller. ✓
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((it, i) => (
            <li key={i}>
              <Link
                href={it.href}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors group",
                  it.severity === "high"
                    ? "border-rose-200 dark:border-rose-500/30 bg-rose-50/40 dark:bg-rose-500/[0.06] hover:bg-rose-50 dark:hover:bg-rose-500/[0.10]"
                    : "border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/[0.06] hover:bg-amber-50 dark:hover:bg-amber-500/[0.10]"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                      it.severity === "high"
                        ? "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30"
                        : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                    )}>
                      {it.type === "stade_6_stagne" && "Stade 6"}
                      {it.type === "stade_4_stagne" && "Stade 4"}
                      {it.type === "mex_non_facturee" && "Mission exc."}
                    </span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{it.title}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{it.detail}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">{formatKEUR(it.montant)}</span>
                  <ExternalLink className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// Drawer reutilisable
// ============================================================================

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex animate-fade-in">
      <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="ml-auto relative w-full max-w-md bg-white dark:bg-[hsl(var(--card))] border-l border-zinc-200 dark:border-white/[0.08] shadow-2xl flex flex-col animate-slide-in-right">
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06] flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function ClientList({ clients }: { clients: WaterfallStage["clients"] }) {
  if (clients.length === 0) {
    return <div className="text-center py-8 text-sm text-zinc-400 italic">Aucun dossier.</div>;
  }
  return (
    <ul className="space-y-1">
      {clients.map((c) => (
        <li key={c.id}>
          <Link
            href={`/clients/${c.slug}`}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group"
          >
            <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate flex-1 group-hover:text-zinc-900 dark:group-hover:text-zinc-50">
              {c.denomination}
            </span>
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatEUR(c.arrPondere)}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">brut {formatKEUR(c.arrBrut)}</div>
            </div>
            <ExternalLink className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
