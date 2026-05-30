"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  ExternalLink,
  Flame,
  PieChart as PieIcon,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Area as RArea,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
} from "recharts";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

type Contrib = {
  source: string;
  label: string;
  montant: number;
  href: string;
  bucket: "realise" | "facturable" | "recurrent" | "ponctuel" | "pondere";
};

export type FinanceData = {
  hero: {
    caYtd: number;
    caLastYear: number;
    caYtdLastYear: number;
    atterrissage: number;
    objectifAnnuel: number;
    atterrissagePct: number;
    mrrCurrent: number;
    mrrDelta: number;
    mrrDeltaPrev: number;
    arrProjete: number;
    sparkCa: { key: string; value: number }[];
    sparkMrr: { key: string; value: number }[];
    sparkAtterrissage: { key: string; value: number }[];
  };
  timeline: Array<{
    key: string;
    label: string;
    isCurrent: boolean;
    isFuture: boolean;
    realise: number;
    facturable: number;
    recurrent: number;
    ponctuel: number;
    pondere: number;
    total: number;
    contribs: Contrib[];
  }>;
  mrrEvolution: Array<{
    key: string;
    label: string;
    gain: number;
    loss: number;
    net: number;
    cumul: number;
    gainItems: { client: string; slug: string; montant: number }[];
    lossItems: { client: string; slug: string; montant: number }[];
  }>;
  scenarios: {
    conservateur: number;
    realiste: number;
    optimiste: number;
    objectif: number;
  };
  funnel: Array<{
    stade: string;
    ponderation: number;
    count: number;
    arrBrut: number;
    arrPondere: number;
    avgAgeDays: number;
    clients: { id: string; slug: string; denomination: string; arrBrut: number; arrPondere: number; ageDays: number }[];
  }>;
  activate: {
    cashItems: Contrib[];
    dealsItems: { title: string; subtitle: string; montant: number; href: string }[];
    risquesItems: { title: string; subtitle: string; montant: number; href: string }[];
    top3Pct: number;
  };
  tendances: { name: string; value: number }[];
  currentYear: number;
  monthsRemaining: number;
};

// ============================================================================
// Couleurs (palette neutre cockpit, distincte de la sémantique état)
// ============================================================================
const COLORS = {
  realise: "#52525b",  // zinc-600 : passé encaissé
  facturable: "#f59e0b", // amber : cash mobilisable maintenant
  recurrent: "#10b981", // emerald : récurrent signé
  ponctuel: "#14b8a6", // teal : ponctuels
  pondere: "#6366f1", // indigo : pondéré pipeline
  cumul: "#0ea5e9", // sky : ligne cumul
  objectif: "#a855f7", // purple : ligne objectif
  gain: "#10b981",
  loss: "#ef4444",
  net: "#0ea5e9",
};

// ============================================================================
// Formatters
// ============================================================================
function formatEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " € HT";
}
function formatKEUR(n: number): string {
  if (Math.abs(n) >= 100000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n / 1000)) + " k";
  }
  if (Math.abs(n) >= 10000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k";
  }
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k";
  }
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function formatPct(n: number, decimals = 0): string {
  return n.toFixed(decimals) + " %";
}
function formatDelta(n: number): { text: string; sign: "+" | "-" | "="; color: string; icon: React.ReactNode } {
  if (n > 0) return { text: `+${formatEUR(n)}`, sign: "+", color: "text-emerald-600 dark:text-emerald-400", icon: <ArrowUpRight className="h-3 w-3" /> };
  if (n < 0) return { text: formatEUR(n), sign: "-", color: "text-rose-600 dark:text-rose-400", icon: <ArrowDownRight className="h-3 w-3" /> };
  return { text: "=", sign: "=", color: "text-zinc-500 dark:text-zinc-400", icon: null };
}

// ============================================================================
// Composant principal
// ============================================================================
export default function FinanceDashboard({ data }: { data: FinanceData }) {
  const [drawer, setDrawer] = useState<{ title: string; subtitle?: string; node: React.ReactNode } | null>(null);

  return (
    <div className="space-y-6">
      {/* 1. HERO */}
      <HeroBlock hero={data.hero} year={data.currentYear} monthsRemaining={data.monthsRemaining} />

      {/* 2. TIMELINE 24 mois */}
      <TimelineBlock
        timeline={data.timeline}
        objectif={data.scenarios.objectif}
        year={data.currentYear}
        onMonthClick={(m) => setDrawer({
          title: `${m.label} · ${formatEUR(m.total)}`,
          subtitle: m.isFuture ? "Projection" : "Réalisé",
          node: <MonthDetail month={m} />,
        })}
      />

      {/* 3. MRR Evolution */}
      <MrrEvolutionBlock evolution={data.mrrEvolution} onMonthClick={(m) => setDrawer({
        title: `${m.label} · MRR ${m.net >= 0 ? "+" : ""}${formatEUR(m.net)}`,
        subtitle: `Gain ${formatEUR(m.gain)} · Churn ${formatEUR(m.loss)} · Cumul ${formatEUR(m.cumul)}`,
        node: <MrrMonthDetail month={m} />,
      })} />

      {/* 4. Encaissements 6 mois + 5. Scénarios atterrissage */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <EncaissementsBlock
            timeline={data.timeline.filter((t) => t.isCurrent || t.isFuture).slice(0, 6)}
            onMonthClick={(m) => setDrawer({
              title: `${m.label} · ${formatEUR(m.total)}`,
              subtitle: "Projection détaillée",
              node: <MonthDetail month={m} />,
            })}
          />
        </div>
        <ScenariosBlock scenarios={data.scenarios} caYtd={data.hero.caYtd} year={data.currentYear} />
      </div>

      {/* 6. Funnel signatures */}
      <FunnelBlock
        funnel={data.funnel}
        onStageClick={(s) => setDrawer({
          title: s.stade,
          subtitle: `${s.count} dossier${s.count > 1 ? "s" : ""} · brut ${formatEUR(s.arrBrut)} · pondéré ${formatEUR(s.arrPondere)} · temps moyen ${s.avgAgeDays} j`,
          node: <ClientList clients={s.clients} />,
        })}
      />

      {/* 7. À activer + 8. Tendances */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ActivateBlock activate={data.activate} />
        </div>
        <TendancesBlock tendances={data.tendances} />
      </div>

      {/* Drawer */}
      {drawer && (
        <Drawer title={drawer.title} subtitle={drawer.subtitle} onClose={() => setDrawer(null)}>
          {drawer.node}
        </Drawer>
      )}
    </div>
  );
}

// ============================================================================
// 1. HERO · 4 big numbers avec sparkline
// ============================================================================
function HeroBlock({ hero, year, monthsRemaining }: { hero: FinanceData["hero"]; year: number; monthsRemaining: number }) {
  const caDelta = hero.caYtd - hero.caYtdLastYear;
  const caDeltaPct = hero.caYtdLastYear > 0 ? (caDelta / hero.caYtdLastYear) * 100 : 0;
  const mrrD = formatDelta(hero.mrrDelta);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <HeroCard
        label={`CA YTD ${year}`}
        value={hero.caYtd}
        sparkData={hero.sparkCa}
        sparkColor={COLORS.realise}
        accent="zinc"
        sub={
          hero.caYtdLastYear > 0
            ? `vs ${formatEUR(hero.caYtdLastYear)} en ${year - 1} · ${caDelta >= 0 ? "+" : ""}${formatPct(caDeltaPct)}`
            : "vs " + formatEUR(0) + " · 1ère année"
        }
        subAccent={caDelta >= 0 ? "emerald" : "rose"}
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <HeroCard
        label={`Atterrissage ${year}`}
        value={hero.atterrissage}
        sparkData={hero.sparkAtterrissage}
        sparkColor={COLORS.cumul}
        accent="sky"
        sub={`${monthsRemaining} mois restants · ${formatPct(hero.atterrissagePct)} de l'objectif (${formatEUR(hero.objectifAnnuel)})`}
        subAccent={hero.atterrissagePct >= 100 ? "emerald" : "amber"}
        icon={<Target className="h-4 w-4" />}
      />
      <HeroCard
        label="MRR signé"
        value={hero.mrrCurrent}
        sparkData={hero.sparkMrr}
        sparkColor={COLORS.gain}
        accent="emerald"
        sub={
          <span className={cn("inline-flex items-center gap-1", mrrD.color)}>
            {mrrD.icon}
            <span>{mrrD.text} ce mois</span>
          </span>
        }
        subAccent="neutral"
        icon={<Flame className="h-4 w-4" />}
      />
      <HeroCard
        label="ARR projeté"
        value={hero.arrProjete}
        sparkData={hero.sparkMrr.map((s) => ({ ...s, value: s.value * 12 }))}
        sparkColor={COLORS.pondere}
        accent="indigo"
        sub={`MRR × 12 · si maintenu`}
        subAccent="neutral"
        icon={<BarChart3 className="h-4 w-4" />}
      />
    </div>
  );
}

function HeroCard({
  label,
  value,
  sparkData,
  sparkColor,
  accent,
  sub,
  subAccent,
  icon,
}: {
  label: string;
  value: number;
  sparkData: { key: string; value: number }[];
  sparkColor: string;
  accent: "zinc" | "sky" | "emerald" | "indigo";
  sub: React.ReactNode;
  subAccent: "emerald" | "rose" | "amber" | "neutral";
  icon: React.ReactNode;
}) {
  const accentRing: Record<typeof accent, string> = {
    zinc: "from-zinc-50 to-white dark:from-white/[0.04] dark:to-transparent",
    sky: "from-sky-50/80 to-white dark:from-sky-500/[0.10] dark:to-transparent",
    emerald: "from-emerald-50/80 to-white dark:from-emerald-500/[0.10] dark:to-transparent",
    indigo: "from-indigo-50/80 to-white dark:from-indigo-500/[0.10] dark:to-transparent",
  };
  const accentIconBg: Record<typeof accent, string> = {
    zinc: "bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300",
    sky: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
    emerald: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    indigo: "bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  };
  const subCls: Record<typeof subAccent, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
    neutral: "text-zinc-500 dark:text-zinc-400",
  };

  return (
    <div className={cn("relative rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-gradient-to-br p-3.5 overflow-hidden", accentRing[accent])}>
      {/* Sparkline en background */}
      {sparkData.length > 0 && (
        <div className="absolute inset-0 opacity-40 dark:opacity-30 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <RArea
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                strokeWidth={1.5}
                fill={`url(#spark-${label})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="relative">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
          <div className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md", accentIconBg[accent])}>
            {icon}
          </div>
        </div>
        <div className="text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">
          {formatEUR(value)}
        </div>
        <div className={cn("text-[11px] mt-1 leading-snug", subCls[subAccent])}>{sub}</div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. TIMELINE 24 mois
// ============================================================================
function TimelineBlock({
  timeline,
  objectif,
  year,
  onMonthClick,
}: {
  timeline: FinanceData["timeline"];
  objectif: number;
  year: number;
  onMonthClick: (m: FinanceData["timeline"][number]) => void;
}) {
  // Construit cumul YTD : à chaque mois, somme des realise/total depuis le début de l'année
  const data = useMemo(() => {
    let cum = 0;
    const yearStartKey = `${year}-01`;
    return timeline.map((t) => {
      // Réinitialise cumul au 1er janvier de l'année courante
      if (t.key === yearStartKey) cum = 0;
      // Pour mois passés : on cumule le realise. Pour mois futurs : on cumule le total.
      if (t.key >= yearStartKey) {
        cum += t.isFuture ? t.total : t.realise;
      }
      return {
        ...t,
        cumul: t.key >= yearStartKey ? cum : 0,
      };
    });
  }, [timeline, year]);

  const totalRealise = timeline.filter((t) => !t.isFuture).reduce((s, t) => s + t.realise, 0);
  const totalProjete = timeline.filter((t) => t.isFuture).reduce((s, t) => s + t.total, 0);

  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-400" />
            Réalisé · projeté · cumul YTD
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            12 mois passés (gris foncé · facturé) + 12 mois futurs (4 buckets empilés) · cliquez un mois pour le détail
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <KpiInline label="Passé 12 m" value={totalRealise} color={COLORS.realise} />
          <KpiInline label="Projeté 12 m" value={totalProjete} color={COLORS.cumul} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Swatch label="Facturé (réalisé)" color={COLORS.realise} />
        <Swatch label="Facturable maintenant" color={COLORS.facturable} />
        <Swatch label="Récurrent signé" color={COLORS.recurrent} />
        <Swatch label="Pondéré pipeline" color={COLORS.pondere} />
        <Swatch label="Cumul YTD" color={COLORS.cumul} solid={false} />
      </div>

      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 8, left: 0, bottom: 16 }}
            onClick={(e) => {
              if (typeof e?.activeTooltipIndex === "number") {
                onMonthClick(timeline[e.activeTooltipIndex]);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-white/[0.06]" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "currentColor" }} className="text-zinc-500 dark:text-zinc-400" tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => formatKEUR(v) + "€"}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-zinc-500 dark:text-zinc-400"
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => formatKEUR(v) + "€"}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-zinc-500 dark:text-zinc-400"
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as (FinanceData["timeline"][number] & { cumul: number }) | undefined;
                if (!d) return null;
                return (
                  <div className="rounded-lg bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] shadow-lg px-3 py-2 text-xs space-y-1 min-w-[200px]">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-1 flex items-center justify-between gap-3">
                      <span>{label}</span>
                      {d.isCurrent && <span className="text-[10px] uppercase tracking-wide text-sky-600 dark:text-sky-400 font-semibold">Maintenant</span>}
                    </div>
                    {!d.isFuture && d.realise > 0 && (
                      <Row color={COLORS.realise} label="Facturé" value={d.realise} />
                    )}
                    {d.facturable > 0 && <Row color={COLORS.facturable} label="Facturable" value={d.facturable} />}
                    {d.recurrent > 0 && <Row color={COLORS.recurrent} label="Récurrent" value={d.recurrent} />}
                    {d.ponctuel > 0 && <Row color={COLORS.ponctuel} label="Ponctuel" value={d.ponctuel} />}
                    {d.pondere > 0 && <Row color={COLORS.pondere} label="Pondéré" value={d.pondere} />}
                    <div className="flex items-center pt-1 mt-1 border-t border-zinc-100 dark:border-white/[0.06]">
                      <span className="text-zinc-700 dark:text-zinc-200 font-semibold">Total</span>
                      <span className="ml-auto tabular-nums text-zinc-900 dark:text-zinc-100 font-semibold">{formatEUR(d.total)}</span>
                    </div>
                    {d.cumul > 0 && (
                      <div className="flex items-center">
                        <span className="text-zinc-500 dark:text-zinc-400">Cumul YTD</span>
                        <span className="ml-auto tabular-nums text-sky-700 dark:text-sky-400 font-medium">{formatEUR(d.cumul)}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 italic">Cliquez pour voir le détail</div>
                  </div>
                );
              }}
            />
            <Bar yAxisId="left" dataKey="realise" stackId="a" fill={COLORS.realise} cursor="pointer" />
            <Bar yAxisId="left" dataKey="facturable" stackId="a" fill={COLORS.facturable} cursor="pointer" />
            <Bar yAxisId="left" dataKey="recurrent" stackId="a" fill={COLORS.recurrent} cursor="pointer" />
            <Bar yAxisId="left" dataKey="ponctuel" stackId="a" fill={COLORS.ponctuel} cursor="pointer" />
            <Bar yAxisId="left" dataKey="pondere" stackId="a" fill={COLORS.pondere} cursor="pointer" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="cumul" stroke={COLORS.cumul} strokeWidth={2} dot={false} />
            {objectif > 0 && (
              <ReferenceLine yAxisId="right" y={objectif} stroke={COLORS.objectif} strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Objectif ${formatKEUR(objectif)}€`, fontSize: 10, fill: COLORS.objectif, position: "insideTopRight" }} />
            )}
            {/* Ligne AUJOURD'HUI : on cherche l'index du mois courant */}
            {(() => {
              const idx = timeline.findIndex((t) => t.isCurrent);
              if (idx < 0) return null;
              return (
                <ReferenceLine
                  yAxisId="left"
                  x={timeline[idx].label}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  label={{ value: "Aujourd'hui", fontSize: 10, fill: "#ef4444", position: "top" }}
                />
              );
            })()}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KpiInline({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-base font-semibold tabular-nums" style={{ color }}>{formatEUR(value)}</div>
    </div>
  );
}

function Swatch({ label, color, solid = true }: { label: string; color: string; solid?: boolean }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400">
      {solid ? (
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      ) : (
        <span className="inline-block w-4 h-0.5 rounded-sm" style={{ backgroundColor: color }} />
      )}
      <span>{label}</span>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="ml-auto tabular-nums text-zinc-900 dark:text-zinc-100 font-medium">{formatEUR(value)}</span>
    </div>
  );
}

// ============================================================================
// 3. MRR EVOLUTION
// ============================================================================
function MrrEvolutionBlock({
  evolution,
  onMonthClick,
}: {
  evolution: FinanceData["mrrEvolution"];
  onMonthClick: (m: FinanceData["mrrEvolution"][number]) => void;
}) {
  const totalGain = evolution.reduce((s, m) => s + m.gain, 0);
  const totalLoss = evolution.reduce((s, m) => s + m.loss, 0);
  const netCumul = evolution[evolution.length - 1]?.cumul ?? 0;
  // Pour le bar chart waterfall : on inverse loss en négatif
  const data = evolution.map((m) => ({ ...m, lossNeg: -m.loss }));

  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            MRR · gains & churn · 24 mois
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Vert = nouvelles signatures · rouge = résiliations · ligne = MRR cumulé net (Δ depuis 24 mois)
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <KpiInline label="Gain 24 m" value={totalGain} color={COLORS.gain} />
          <KpiInline label="Churn 24 m" value={-totalLoss} color={COLORS.loss} />
          <KpiInline label="Net cumul" value={netCumul} color={netCumul >= 0 ? COLORS.gain : COLORS.loss} />
        </div>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
            onClick={(e) => {
              if (typeof e?.activeTooltipIndex === "number") {
                onMonthClick(evolution[e.activeTooltipIndex]);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-white/[0.06]" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "currentColor" }} className="text-zinc-500 dark:text-zinc-400" tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" tickFormatter={(v) => formatKEUR(v) + "€"} tick={{ fontSize: 10, fill: "currentColor" }} className="text-zinc-500 dark:text-zinc-400" tickLine={false} axisLine={false} width={48} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatKEUR(v) + "€"} tick={{ fontSize: 10, fill: "currentColor" }} className="text-zinc-500 dark:text-zinc-400" tickLine={false} axisLine={false} width={48} />
            <ReferenceLine yAxisId="left" y={0} stroke="currentColor" className="text-zinc-300 dark:text-white/[0.10]" />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as (FinanceData["mrrEvolution"][number] & { lossNeg: number }) | undefined;
                if (!d) return null;
                return (
                  <div className="rounded-lg bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] shadow-lg px-3 py-2 text-xs space-y-1 min-w-[200px]">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">{label}</div>
                    {d.gain > 0 && <Row color={COLORS.gain} label={`Gain (${d.gainItems.length})`} value={d.gain} />}
                    {d.loss > 0 && <Row color={COLORS.loss} label={`Churn (${d.lossItems.length})`} value={-d.loss} />}
                    <div className="flex items-center pt-1 mt-1 border-t border-zinc-100 dark:border-white/[0.06]">
                      <span className="text-zinc-700 dark:text-zinc-200 font-semibold">Net</span>
                      <span className={cn("ml-auto tabular-nums font-semibold", d.net >= 0 ? "text-emerald-600" : "text-rose-600")}>{d.net >= 0 ? "+" : ""}{formatEUR(d.net)}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-zinc-500 dark:text-zinc-400">Cumul</span>
                      <span className="ml-auto tabular-nums text-sky-700 dark:text-sky-400 font-medium">{formatEUR(d.cumul)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 italic">Cliquez pour voir le détail</div>
                  </div>
                );
              }}
            />
            <Bar yAxisId="left" dataKey="gain" fill={COLORS.gain} radius={[3, 3, 0, 0]} cursor="pointer" />
            <Bar yAxisId="left" dataKey="lossNeg" fill={COLORS.loss} radius={[0, 0, 3, 3]} cursor="pointer" />
            <Line yAxisId="right" type="monotone" dataKey="cumul" stroke={COLORS.cumul} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MrrMonthDetail({ month }: { month: FinanceData["mrrEvolution"][number] }) {
  if (month.gainItems.length === 0 && month.lossItems.length === 0) {
    return <div className="text-center py-8 text-sm text-zinc-400 italic">Aucun mouvement ce mois.</div>;
  }
  return (
    <div className="space-y-4">
      {month.gainItems.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 uppercase tracking-wide">
            ▲ Gains · {formatEUR(month.gain)}
          </div>
          <ul className="space-y-1">
            {month.gainItems.map((it, i) => (
              <li key={i}>
                <Link href={`/clients/${it.slug}`} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors">
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">{it.client}</span>
                  <span className="text-sm tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">+{formatEUR(it.montant)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {month.lossItems.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-2 uppercase tracking-wide">
            ▼ Churn · −{formatEUR(month.loss)}
          </div>
          <ul className="space-y-1">
            {month.lossItems.map((it, i) => (
              <li key={i}>
                <Link href={`/clients/${it.slug}`} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors">
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">{it.client}</span>
                  <span className="text-sm tabular-nums text-rose-700 dark:text-rose-400 font-medium">−{formatEUR(it.montant)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. ENCAISSEMENTS 6 mois
// ============================================================================
function EncaissementsBlock({
  timeline,
  onMonthClick,
}: {
  timeline: FinanceData["timeline"];
  onMonthClick: (m: FinanceData["timeline"][number]) => void;
}) {
  const total = timeline.reduce((s, m) => s + m.total, 0);
  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4 h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-zinc-400" />
            Encaissements · 6 prochains mois
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cliquez un mois pour le détail · breakdown par source
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total 6 mois</div>
          <div className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatEUR(total)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {timeline.map((m) => {
          const t = m.facturable + m.recurrent + m.ponctuel + m.pondere + m.realise;
          if (t <= 0) {
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onMonthClick(m)}
                className="rounded-lg border border-dashed border-zinc-200 dark:border-white/[0.08] p-3 text-left text-[11px] text-zinc-400 italic hover:border-zinc-300 dark:hover:border-white/[0.16] transition-colors"
              >
                <div className="font-medium uppercase">{m.label}</div>
                <div className="mt-1">Aucun encaissement</div>
              </button>
            );
          }
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onMonthClick(m)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors group",
                m.isCurrent
                  ? "border-sky-300 dark:border-sky-500/40 bg-sky-50/40 dark:bg-sky-500/[0.06]"
                  : "border-zinc-200 dark:border-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.16] bg-zinc-50/30 dark:bg-white/[0.02]"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide font-medium text-zinc-500 dark:text-zinc-400">
                  {m.label}
                  {m.isCurrent && <span className="ml-1 text-sky-600 dark:text-sky-400">·</span>}
                </span>
              </div>
              <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatEUR(t)}
              </div>
              {/* Mini bar empilée */}
              <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-zinc-100 dark:bg-white/[0.04]">
                {m.realise > 0 && <div className="h-full" style={{ width: `${(m.realise / t) * 100}%`, backgroundColor: COLORS.realise }} />}
                {m.facturable > 0 && <div className="h-full" style={{ width: `${(m.facturable / t) * 100}%`, backgroundColor: COLORS.facturable }} />}
                {m.recurrent > 0 && <div className="h-full" style={{ width: `${(m.recurrent / t) * 100}%`, backgroundColor: COLORS.recurrent }} />}
                {m.ponctuel > 0 && <div className="h-full" style={{ width: `${(m.ponctuel / t) * 100}%`, backgroundColor: COLORS.ponctuel }} />}
                {m.pondere > 0 && <div className="h-full" style={{ width: `${(m.pondere / t) * 100}%`, backgroundColor: COLORS.pondere }} />}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                {m.contribs.length} ligne{m.contribs.length > 1 ? "s" : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthDetail({ month }: { month: FinanceData["timeline"][number] }) {
  const byBucket = useMemo(() => {
    const m = new Map<Contrib["bucket"], Contrib[]>();
    for (const c of month.contribs) {
      const arr = m.get(c.bucket) ?? [];
      arr.push(c);
      m.set(c.bucket, arr);
    }
    return m;
  }, [month.contribs]);

  if (month.contribs.length === 0) {
    return <div className="text-center py-8 text-sm text-zinc-400 italic">Aucun mouvement.</div>;
  }
  const order: Contrib["bucket"][] = ["realise", "facturable", "recurrent", "ponctuel", "pondere"];
  const labels: Record<Contrib["bucket"], { label: string; color: string }> = {
    realise: { label: "Réalisé · facturé", color: COLORS.realise },
    facturable: { label: "Facturable maintenant", color: COLORS.facturable },
    recurrent: { label: "Récurrent signé", color: COLORS.recurrent },
    ponctuel: { label: "Ponctuel signé", color: COLORS.ponctuel },
    pondere: { label: "Pondéré pipeline", color: COLORS.pondere },
  };
  return (
    <div className="space-y-4">
      {order.map((b) => {
        const items = byBucket.get(b);
        if (!items || items.length === 0) return null;
        const total = items.reduce((s, i) => s + i.montant, 0);
        return (
          <div key={b}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: labels[b].color }} />
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{labels[b].label}</span>
                <span className="text-[10px] text-zinc-400">· {items.length}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums" style={{ color: labels[b].color }}>{formatEUR(total)}</span>
            </div>
            <ul className="space-y-1">
              {items.map((c, i) => (
                <li key={i}>
                  <Link href={c.href} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{c.label}</div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{c.source}</div>
                    </div>
                    <div className="text-sm tabular-nums font-medium text-zinc-700 dark:text-zinc-300 shrink-0">{formatEUR(c.montant)}</div>
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
// 5. SCENARIOS ATTERRISSAGE
// ============================================================================
function ScenariosBlock({ scenarios, caYtd, year }: { scenarios: FinanceData["scenarios"]; caYtd: number; year: number }) {
  const data = [
    { name: "Conservateur", value: scenarios.conservateur, color: "#10b981", icon: "🟢" },
    { name: "Réaliste", value: scenarios.realiste, color: "#0ea5e9", icon: "🔵" },
    { name: "Optimiste", value: scenarios.optimiste, color: "#f59e0b", icon: "🟡" },
  ];
  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4 h-full">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Target className="h-4 w-4 text-zinc-400" />
          Atterrissage {year}
        </h3>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          3 trajectoires · YTD {formatEUR(caYtd)} + projection
        </p>
      </div>
      <div className="space-y-3">
        {data.map((s) => {
          const delta = s.value - caYtd;
          const pctObjectif = scenarios.objectif > 0 ? (s.value / scenarios.objectif) * 100 : 0;
          return (
            <div key={s.name} className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/30 dark:bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <span>{s.icon}</span>
                  <span>{s.name}</span>
                </span>
                <span className="text-base font-semibold tabular-nums" style={{ color: s.color }}>{formatEUR(s.value)}</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.04] overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, pctObjectif)}%`, backgroundColor: s.color }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  +{formatEUR(delta)} vs YTD
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">{formatPct(pctObjectif)} obj.</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/[0.06] text-[10px] text-zinc-500 dark:text-zinc-400">
        Objectif annuel : {formatEUR(scenarios.objectif)} · maintien ARR signé actuel
      </div>
    </div>
  );
}

// ============================================================================
// 6. FUNNEL signatures
// ============================================================================
function FunnelBlock({
  funnel,
  onStageClick,
}: {
  funnel: FinanceData["funnel"];
  onStageClick: (s: FinanceData["funnel"][number]) => void;
}) {
  const maxBrut = Math.max(...funnel.map((s) => s.arrBrut), 1);
  const stages = [...funnel].reverse(); // affiche stade 6 en haut

  const totalBrut = funnel.reduce((s, w) => s + w.arrBrut, 0);
  const totalPondere = funnel.reduce((s, w) => s + w.arrPondere, 0);
  const totalCount = funnel.reduce((s, w) => s + w.count, 0);

  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-400" />
            Funnel signatures · {totalCount} dossier{totalCount > 1 ? "s" : ""} en cours
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            ARR brut → pondéré · âge moyen dans le stade · cliquez pour le détail
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <KpiInline label="ARR brut" value={totalBrut} color="#71717a" />
          <KpiInline label="Pondéré" value={totalPondere} color={COLORS.pondere} />
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 italic">Aucun prospect en cours.</div>
      ) : (
        <div className="space-y-2">
          {stages.map((s) => {
            const pctBrut = (s.arrBrut / maxBrut) * 100;
            const pctConserve = s.arrBrut > 0 ? (s.arrPondere / s.arrBrut) * 100 : 0;
            const disabled = s.count === 0;
            return (
              <button
                key={s.stade}
                type="button"
                onClick={() => !disabled && onStageClick(s)}
                disabled={disabled}
                className={cn(
                  "w-full text-left rounded-lg border border-zinc-200 dark:border-white/[0.08] p-3 transition-all",
                  disabled
                    ? "bg-zinc-50/30 dark:bg-white/[0.01] opacity-50 cursor-default"
                    : "bg-zinc-50/40 dark:bg-white/[0.02] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] cursor-pointer"
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{s.stade}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">{s.count} dossier{s.count > 1 ? "s" : ""}</span>
                    {s.avgAgeDays > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                        <Clock className="h-3 w-3" />
                        <span>{s.avgAgeDays} j moyen</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                    <span className="text-zinc-500 dark:text-zinc-400">{formatEUR(s.arrBrut)}</span>
                    <span className="text-zinc-300 dark:text-zinc-600">→</span>
                    <span className="font-semibold text-indigo-700 dark:text-indigo-300">{formatEUR(s.arrPondere)}</span>
                  </div>
                </div>
                <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-white/[0.04] overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-zinc-300 dark:bg-white/[0.10]" style={{ width: `${pctBrut}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-indigo-500 dark:bg-indigo-400" style={{ width: `${pctBrut * (pctConserve / 100)}%` }} />
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Pondération {formatPct(s.ponderation * 100)} · {formatPct(pctConserve)} conservé après pondération
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientList({ clients }: { clients: FinanceData["funnel"][number]["clients"] }) {
  if (clients.length === 0) return <div className="text-center py-8 text-sm text-zinc-400 italic">Aucun dossier.</div>;
  return (
    <ul className="space-y-1">
      {clients.map((c) => (
        <li key={c.id}>
          <Link href={`/clients/${c.slug}`} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{c.denomination}</div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{c.ageDays} j dans le stade</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">{formatEUR(c.arrPondere)}</div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">brut {formatEUR(c.arrBrut)}</div>
            </div>
            <ExternalLink className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// 7. À ACTIVER MAINTENANT (3 colonnes)
// ============================================================================
function ActivateBlock({ activate }: { activate: FinanceData["activate"] }) {
  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4 h-full">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
        <Flame className="h-4 w-4 text-zinc-400" />
        À activer maintenant
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cash */}
        <ActivateColumn
          title="💰 Cash à débloquer"
          subtitle={`${activate.cashItems.length} factures à émettre`}
          accent="amber"
          items={activate.cashItems.map((c) => ({
            title: c.label,
            subtitle: c.source,
            montant: c.montant,
            href: c.href,
          }))}
          footerLink={{ label: "Voir tout dans /facturation", href: "/facturation" }}
        />
        {/* Deals */}
        <ActivateColumn
          title="🔥 Deals à forcer"
          subtitle={`${activate.dealsItems.length} prospects chauds qui stagnent`}
          accent="indigo"
          items={activate.dealsItems}
          footerLink={{ label: "Voir le pipeline", href: "/pipeline" }}
        />
        {/* Risques */}
        <ActivateColumn
          title="⚠️ Risques"
          subtitle={`Concentration top 3 : ${activate.top3Pct} %`}
          accent={activate.top3Pct > 50 ? "rose" : "zinc"}
          items={activate.risquesItems}
          footerLink={{ label: "Voir tous les clients", href: "/clients" }}
        />
      </div>
    </div>
  );
}

function ActivateColumn({
  title,
  subtitle,
  accent,
  items,
  footerLink,
}: {
  title: string;
  subtitle: string;
  accent: "amber" | "indigo" | "rose" | "zinc";
  items: { title: string; subtitle: string; montant: number; href: string }[];
  footerLink: { label: string; href: string };
}) {
  const accentCls: Record<typeof accent, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    indigo: "text-indigo-700 dark:text-indigo-300",
    rose: "text-rose-700 dark:text-rose-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div>
      <div className="mb-2">
        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{title}</div>
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</div>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-4 text-xs text-zinc-400 italic border border-dashed border-zinc-200 dark:border-white/[0.08] rounded-lg">
          Rien à activer ✓
        </div>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 5).map((it, i) => (
            <li key={i}>
              <Link href={it.href} className="block p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{it.title}</span>
                  <span className={cn("text-xs tabular-nums font-semibold shrink-0", accentCls[accent])}>{formatEUR(it.montant)}</span>
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{it.subtitle}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={footerLink.href} className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
        {footerLink.label}
        <ExternalLink className="h-2.5 w-2.5" />
      </Link>
    </div>
  );
}

// ============================================================================
// 8. TENDANCES ACTIVITE
// ============================================================================
function TendancesBlock({ tendances }: { tendances: FinanceData["tendances"] }) {
  const PIE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#6366f1", "#14b8a6", "#ef4444", "#a855f7", "#84cc16", "#71717a"];
  const total = tendances.reduce((s, t) => s + t.value, 0);
  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-4 h-full flex flex-col">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-zinc-400" />
          CA YTD · par activité
        </h3>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">D'où vient l'argent</p>
      </div>
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-400 italic">Aucun CA réalisé YTD.</div>
      ) : (
        <>
          <div className="h-[180px] -mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tendances} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {tendances.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as { name: string; value: number } | undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] shadow-lg px-3 py-2 text-xs">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</div>
                        <div className="tabular-nums text-zinc-700 dark:text-zinc-300">{formatEUR(p.value)} · {formatPct((p.value / total) * 100)}</div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1 text-xs">
            {tendances.slice(0, 5).map((t, i) => (
              <li key={t.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{t.name}</span>
                </div>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">{formatEUR(t.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Drawer
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
          <button type="button" onClick={onClose} className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors shrink-0" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
