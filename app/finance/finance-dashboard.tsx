"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ExternalLink, TrendingUp, Wallet, Briefcase, Target } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

export type ClientFinance = {
  id: string;
  slug: string;
  denomination: string;
  mrr: number;
  arr: number;
};

export type PipelineRow = {
  id: string;
  slug: string;
  denomination: string;
  stade: string;
  ponderation: number;
  arrBrut: number;
  oneShot: number;
  totalBrut: number;
  totalPondere: number;
};

export type CashBucket = {
  key: "ir" | "caa" | "ago" | "bilan" | "mission_exc";
  label: string;
  count: number;
  montant: number;
  href: string;
};

export type MissionsExcStats = {
  a_demarrer: number;
  en_cours: number;
  livree_a_facturer: number;
  facturee: number;
  total_ca_a_facturer: number;
  total_ca_facture: number;
  total_ca_en_cours: number;
};

export type FinanceData = {
  mrrSigne: number;
  arrSigne: number;
  nbSignes: number;
  arrBreakdown: { compta: number; pilotage: number; bilan: number; juridique: number };
  topClients: ClientFinance[];
  pipelineRows: PipelineRow[];
  totalPipelinePondere: number;
  totalPipelineBrut: number;
  nbProspects: number;
  cashBuckets: CashBucket[];
  totalCashAFacturer: number;
  mexStats: MissionsExcStats;
};

// Couleurs neutres distinctes (pas amber/sky/emerald/zinc reserves)
const BREAKDOWN_COLORS: Record<string, string> = {
  compta: "#0ea5e9",     // sky-500 - on l'utilise ici comme tag, pas etat
  pilotage: "#14b8a6",   // teal-500
  bilan: "#f97316",      // orange-500
  juridique: "#a855f7",  // purple-500
};

function formatEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " € HT";
}

function formatKEUR(n: number): string {
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k€ HT";
  }
  return formatEUR(n);
}

export default function FinanceDashboard({ data }: { data: FinanceData }) {
  return (
    <div className="space-y-6">
      <KpiCards data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ArrBreakdownCard data={data} />
        <TopClientsCard clients={data.topClients} />
      </div>

      <PipelinePondereCard data={data} />

      <CashMobilisableCard data={data} />

      <MissionsExcCard stats={data.mexStats} />
    </div>
  );
}

// ============================================================================
// KPI Cards (4 indicateurs synthetiques)
// ============================================================================

function KpiCards({ data }: { data: FinanceData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        icon={<TrendingUp className="h-4 w-4" />}
        label="MRR signé"
        value={formatKEUR(data.mrrSigne)}
        subtitle={`${data.nbSignes} dossier${data.nbSignes > 1 ? "s" : ""} en LDM signée`}
        accent="emerald"
      />
      <Kpi
        icon={<TrendingUp className="h-4 w-4" />}
        label="ARR signé"
        value={formatKEUR(data.arrSigne)}
        subtitle="Base récurrente annualisée"
        accent="emerald"
      />
      <Kpi
        icon={<Target className="h-4 w-4" />}
        label="CA pipeline pondéré"
        value={formatKEUR(data.totalPipelinePondere)}
        subtitle={`${data.nbProspects} prospect${data.nbProspects > 1 ? "s" : ""} · brut ${formatKEUR(data.totalPipelineBrut)}`}
        accent="sky"
      />
      <Kpi
        icon={<Wallet className="h-4 w-4" />}
        label="À facturer maintenant"
        value={formatKEUR(data.totalCashAFacturer)}
        subtitle="Cash mobilisable rapidement"
        accent="amber"
        href="/facturation"
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  subtitle,
  accent,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  accent: "emerald" | "sky" | "amber" | "zinc";
  href?: string;
}) {
  const accentClasses: Record<typeof accent, { text: string; bg: string }> = {
    emerald: { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
    sky: { text: "text-sky-700 dark:text-sky-300", bg: "bg-sky-50 dark:bg-sky-500/15" },
    amber: { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-500/15" },
    zinc: { text: "text-zinc-700 dark:text-zinc-300", bg: "bg-zinc-50 dark:bg-white/[0.04]" },
  };
  const cls = accentClasses[accent];
  const inner = (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-4 shadow-card hover:border-zinc-300 dark:hover:border-white/[0.16] transition-colors h-full">
      <div className="flex items-center justify-between gap-2">
        <div className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md", cls.bg, cls.text)}>
          {icon}
        </div>
        {href && <ArrowRight className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums mt-1", cls.text)}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">
        {subtitle}
      </div>
    </div>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

// ============================================================================
// ARR Breakdown (donut par type d'honoraires)
// ============================================================================

function ArrBreakdownCard({ data }: { data: FinanceData }) {
  const total =
    data.arrBreakdown.compta +
    data.arrBreakdown.pilotage +
    data.arrBreakdown.bilan +
    data.arrBreakdown.juridique;

  const pieData = [
    { name: "Compta", value: data.arrBreakdown.compta, key: "compta" },
    { name: "Pilotage", value: data.arrBreakdown.pilotage, key: "pilotage" },
    { name: "Bilan", value: data.arrBreakdown.bilan, key: "bilan" },
    { name: "Juridique", value: data.arrBreakdown.juridique, key: "juridique" },
  ].filter((d) => d.value > 0);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            ARR signé · répartition
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Par type d&apos;honoraires récurrents
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatKEUR(total)}
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Annualisé</div>
        </div>
      </div>

      {pieData.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
          Pas encore de récurrent signé.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={BREAKDOWN_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0];
                    const value = typeof p.value === "number" ? p.value : 0;
                    return (
                      <div className="rounded-lg bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] shadow-lg px-3 py-2 text-xs">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</div>
                        <div className="text-zinc-600 dark:text-zinc-400 tabular-nums">
                          {formatEUR(value)} · {((value / total) * 100).toFixed(0)} %
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {pieData.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: BREAKDOWN_COLORS[d.key] }}
                  />
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{d.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatKEUR(d.value)}
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {((d.value / total) * 100).toFixed(0)} %
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Top clients
// ============================================================================

function TopClientsCard({ clients }: { clients: ClientFinance[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? clients : clients.slice(0, 10);
  const totalArr = clients.reduce((acc, c) => acc + c.arr, 0);
  // Concentration : part du top 5 dans le total
  const top5 = clients.slice(0, 5).reduce((acc, c) => acc + c.arr, 0);
  const concentrationPct = totalArr > 0 ? (top5 / totalArr) * 100 : 0;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Top clients · ARR
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Top 5 = {concentrationPct.toFixed(0)} % du récurrent total
          </p>
        </div>
        {clients.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors shrink-0"
          >
            {showAll ? "Voir top 10" : `Voir tout (${clients.length})`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
          Pas encore de client signé.
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((c, i) => {
            const part = totalArr > 0 ? (c.arr / totalArr) * 100 : 0;
            return (
              <Link
                key={c.id}
                href={`/clients/${c.slug}`}
                className="flex items-center justify-between gap-3 px-2 py-1.5 -mx-2 rounded hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums w-5 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                    {c.denomination}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:block w-20 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${Math.min(part, 100)}%` }}
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatKEUR(c.arr)}
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {part.toFixed(1)} %
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Pipeline pondéré
// ============================================================================

function PipelinePondereCard({ data }: { data: FinanceData }) {
  // Group by stade pour visualiser la repartition pondere
  const byStade = useMemo(() => {
    const groups = new Map<string, { stade: string; ponderation: number; brut: number; pondere: number; count: number }>();
    for (const r of data.pipelineRows) {
      const key = r.stade;
      if (!groups.has(key)) {
        groups.set(key, { stade: key, ponderation: r.ponderation, brut: 0, pondere: 0, count: 0 });
      }
      const g = groups.get(key)!;
      g.brut += r.totalBrut;
      g.pondere += r.totalPondere;
      g.count++;
    }
    return [...groups.values()].sort((a, b) => b.ponderation - a.ponderation);
  }, [data.pipelineRows]);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pipeline pondéré · CA projeté
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            ARR annuel des prospects × probabilité de signature par stade
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-300">
            {formatKEUR(data.totalPipelinePondere)}
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Brut {formatKEUR(data.totalPipelineBrut)}
          </div>
        </div>
      </div>

      {byStade.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
          Aucun prospect en cours.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/[0.06]">
              <tr>
                <th className="text-left font-medium px-3 py-2">Stade</th>
                <th className="text-right font-medium px-3 py-2 w-[80px]">Dossiers</th>
                <th className="text-right font-medium px-3 py-2 w-[100px]">Pondération</th>
                <th className="text-right font-medium px-3 py-2 w-[130px]">CA brut</th>
                <th className="text-right font-medium px-3 py-2 w-[130px]">CA pondéré</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {byStade.map((g) => (
                <tr key={g.stade} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2.5 text-zinc-800 dark:text-zinc-200 text-xs">
                    {g.stade}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {g.count}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-12 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.08] overflow-hidden inline-block">
                        <span
                          className="block h-full bg-sky-500 dark:bg-sky-400"
                          style={{ width: `${g.ponderation * 100}%` }}
                        />
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300 text-xs">
                        {(g.ponderation * 100).toFixed(0)} %
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400 text-xs">
                    {formatKEUR(g.brut)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-sky-700 dark:text-sky-300">
                    {formatKEUR(g.pondere)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-zinc-200 dark:border-white/[0.10] font-medium">
              <tr>
                <td className="px-3 py-2.5 text-xs text-zinc-700 dark:text-zinc-300">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                  {byStade.reduce((acc, g) => acc + g.count, 0)}
                </td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400 text-xs">
                  {formatKEUR(data.totalPipelineBrut)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-sky-700 dark:text-sky-300">
                  {formatKEUR(data.totalPipelinePondere)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data.pipelineRows.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors select-none">
            Voir le détail par dossier ({data.pipelineRows.length}) ▾
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/[0.06]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Client</th>
                  <th className="text-left font-medium px-3 py-2">Stade</th>
                  <th className="text-right font-medium px-3 py-2">ARR brut</th>
                  <th className="text-right font-medium px-3 py-2">One-shot</th>
                  <th className="text-right font-medium px-3 py-2">Pondéré</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {data.pipelineRows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-3 py-2">
                      <Link
                        href={`/clients/${r.slug}`}
                        className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 truncate inline-flex items-center gap-1"
                      >
                        {r.denomination}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.stade}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatKEUR(r.arrBrut)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {r.oneShot > 0 ? formatKEUR(r.oneShot) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-sky-700 dark:text-sky-300">
                      {formatKEUR(r.totalPondere)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// ============================================================================
// Cash mobilisable
// ============================================================================

function CashMobilisableCard({ data }: { data: FinanceData }) {
  const buckets = data.cashBuckets.filter((b) => b.montant > 0 || b.count > 0);
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Cash mobilisable · à facturer
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Factures prêtes à émettre, par source
          </p>
        </div>
        <Link
          href="/facturation"
          className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1"
        >
          Aller facturer
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {buckets.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
          Rien à facturer pour l&apos;instant. ✓
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {buckets.map((b) => (
            <Link
              key={b.key}
              href={b.href}
              className="block rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02] p-3 hover:border-amber-300 dark:hover:border-amber-500/30 hover:bg-amber-50/50 dark:hover:bg-amber-500/[0.08] transition-colors group"
            >
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
                {b.label}
              </div>
              <div className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-300 mt-1">
                {formatKEUR(b.montant)}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {b.count} dossier{b.count > 1 ? "s" : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Missions exceptionnelles
// ============================================================================

function MissionsExcCard({ stats }: { stats: MissionsExcStats }) {
  const empty =
    stats.a_demarrer === 0 &&
    stats.en_cours === 0 &&
    stats.livree_a_facturer === 0 &&
    stats.facturee === 0;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Missions exceptionnelles
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              CA ponctuel : transferts, attestations, évaluations…
            </p>
          </div>
        </div>
        <Link
          href="/missions/exceptionnelles"
          className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1"
        >
          Détail
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {empty ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
          Aucune mission exceptionnelle.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MexCard
            label="À démarrer / en cours"
            count={stats.a_demarrer + stats.en_cours}
            montant={stats.total_ca_en_cours}
            accent="sky"
          />
          <MexCard
            label="Livrées à facturer"
            count={stats.livree_a_facturer}
            montant={stats.total_ca_a_facturer}
            accent="amber"
          />
          <MexCard
            label="Facturées"
            count={stats.facturee}
            montant={stats.total_ca_facture}
            accent="emerald"
          />
          <MexCard
            label="CA cumulé"
            count={stats.facturee + stats.livree_a_facturer}
            montant={stats.total_ca_facture + stats.total_ca_a_facturer}
            accent="zinc"
            subtitle="Livrées + facturées"
          />
        </div>
      )}
    </div>
  );
}

function MexCard({
  label,
  count,
  montant,
  accent,
  subtitle,
}: {
  label: string;
  count: number;
  montant: number;
  accent: "sky" | "amber" | "emerald" | "zinc";
  subtitle?: string;
}) {
  const accentText: Record<typeof accent, string> = {
    sky: "text-sky-700 dark:text-sky-300",
    amber: "text-amber-700 dark:text-amber-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
        {label}
      </div>
      <div className={cn("text-lg font-semibold tabular-nums mt-1", accentText[accent])}>
        {formatKEUR(montant)}
      </div>
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
        {count} mission{count > 1 ? "s" : ""}
        {subtitle && ` · ${subtitle}`}
      </div>
    </div>
  );
}
