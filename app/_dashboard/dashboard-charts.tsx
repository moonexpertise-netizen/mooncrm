"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import type { DashboardData } from "./dashboard-data";

/**
 * Composant client du dashboard. Reçoit toutes les données pré-agrégées
 * en props et rend 6 sections de BI :
 *
 *  1. KPI cards top (4 indicateurs synthétiques)
 *  2. Pipeline funnel (bar chart cliquable)
 *  3. Signatures 12 mois (composed chart : barres + ligne cumul YTD)
 *  4. Top 10 clients par ARR (liste cliquable)
 *  5. Production à risque (3 voyants alerte)
 *  6. Mix activité (donut)
 */
export default function DashboardCharts({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      <KpiCards kpi={data.kpi} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineFunnel pipeline={data.pipeline} />
        <SignaturesParMois signaturesParMois={data.signaturesParMois} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopClients topClients={data.topClients} />
        <ProductionRisque risque={data.productionRisque} />
        <MixActivite mixActivite={data.mixActivite} />
      </div>
    </div>
  );
}

// ============================================================================
//  KPI Cards
// ============================================================================

function KpiCards({ kpi }: { kpi: DashboardData["kpi"] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <KpiCard
        label="Clients actifs"
        value={kpi.clientsActifs.toString()}
        sub="LDM signée · interne · sous-traitance"
        icon={<Users className="h-5 w-5" />}
        href="/clients"
        tone="neutral"
      />
      <KpiCard
        label="MRR"
        value={fmtEuro(kpi.mrr)}
        sub={`ARR ${fmtEuro(kpi.arr)}`}
        icon={<TrendingUp className="h-5 w-5" />}
        tone="gold"
      />
      <KpiCard
        label="Signatures du mois"
        value={kpi.signaturesCeMois.toString()}
        sub={`${fmtEuro(kpi.arrSigneCeMois)} ARR signé`}
        icon={<CalendarClock className="h-5 w-5" />}
        tone="emerald"
      />
      <KpiCard
        label="ARR / client"
        value={
          kpi.clientsActifs > 0
            ? fmtEuro(Math.round(kpi.arr / kpi.clientsActifs))
            : "-"
        }
        sub="moyenne par dossier actif"
        icon={<TrendingUp className="h-5 w-5" />}
        tone="violet"
      />
    </div>
  );
}

type KpiTone = "neutral" | "gold" | "emerald" | "violet";

const KPI_TONE: Record<KpiTone, { icon: string; ring: string }> = {
  neutral: {
    icon: "bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300",
    ring: "hover:border-zinc-300 dark:hover:border-white/[0.16]",
  },
  gold: {
    icon:
      "bg-gradient-to-br from-[hsl(var(--gold))]/25 to-[hsl(var(--gold))]/5 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] border border-[hsl(var(--gold))]/20",
    ring: "hover:border-[hsl(var(--gold))]/40",
  },
  emerald: {
    icon: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20",
    ring: "hover:border-emerald-200 dark:hover:border-emerald-500/40",
  },
  violet: {
    icon: "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20",
    ring: "hover:border-violet-200 dark:hover:border-violet-500/40",
  },
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  tone?: KpiTone;
}) {
  const toneClass = KPI_TONE[tone];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0",
            toneClass.icon
          )}
        >
          {icon}
        </span>
      </div>
      <div className="font-display text-3xl md:text-[32px] font-semibold tracking-tight text-zinc-900 tabular-nums leading-none">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-zinc-500 mt-2 truncate">{sub}</div>
      )}
    </>
  );
  const base =
    "block rounded-2xl border border-zinc-200/70 bg-white shadow-card px-5 py-4 transition-all";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, toneClass.ring, "hover:shadow-card-hover hover:-translate-y-px")}
      >
        {content}
      </Link>
    );
  }
  return <div className={base}>{content}</div>;
}

// ============================================================================
//  Pipeline funnel
// ============================================================================

function PipelineFunnel({ pipeline }: { pipeline: DashboardData["pipeline"] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"count" | "arr">("count");

  // Filtrer les étapes à 0 pour la lisibilité (mais on les garde si toutes à 0)
  const visible = pipeline.filter((p) => p.count > 0);
  const display = visible.length > 0 ? visible : pipeline;

  const data = display.map((p) => ({
    name: shortLabel(p.statut),
    full: p.statut,
    value: mode === "count" ? p.count : p.arr,
    color: p.color,
  }));

  function onBarClick(payload: unknown) {
    const data = payload as { full?: string } | undefined;
    if (!data?.full) return;
    router.push(`/clients?pipeline=${encodeURIComponent(data.full)}`);
  }

  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-5">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 tracking-tight">Pipeline</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Clique sur une barre pour filtrer les clients
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <SegToggle
            options={[
              { value: "count", label: "Nb" },
              { value: "arr", label: "€" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as "count" | "arr")}
          />
        </div>
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 30 }}>
            <XAxis
              dataKey="name"
              angle={-25}
              textAnchor="end"
              interval={0}
              tick={{ fontSize: 10, fill: "#71717a" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickFormatter={(v) =>
                mode === "arr" ? fmtCompactEuro(v) : fmtCompactCount(v)
              }
              width={56}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { full: string; value: number };
                return (
                  <div className="bg-white dark:bg-[hsl(var(--surface-elevated))] border dark:border-white/[0.12] rounded-md shadow-md dark:shadow-pop px-2 py-1 text-xs">
                    <div className="font-medium">{p.full}</div>
                    <div className="text-zinc-600 tabular-nums">
                      {mode === "arr"
                        ? fmtEuro(p.value)
                        : `${fmtCompactCount(p.value)} dossier${p.value > 1 ? "s" : ""}`}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={onBarClick}
            >
              <LabelList
                dataKey="value"
                position="top"
                style={{ fontSize: 10, fill: "#52525b" }}
                formatter={(v: unknown) =>
                  mode === "arr"
                    ? fmtCompactEuro(Number(v))
                    : fmtCompactCount(Number(v))
                }
              />
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ============================================================================
//  Signatures par mois (12 derniers mois)
// ============================================================================

function SignaturesParMois({
  signaturesParMois,
}: {
  signaturesParMois: DashboardData["signaturesParMois"];
}) {
  const [mode, setMode] = useState<"count" | "arr">("count");

  const data = signaturesParMois.map((m) => ({
    month: m.monthLabel,
    value: mode === "count" ? m.count : m.arr,
    cumul: mode === "count" ? m.cumulCountYtd : m.cumulArrYtd,
  }));

  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-5">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
            Signatures · 12 derniers mois
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Barres = mois · ligne = cumul YTD (reset au 1er janvier)
          </p>
        </div>
        <SegToggle
          options={[
            { value: "count", label: "Nb" },
            { value: "arr", label: "€" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "count" | "arr")}
        />
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 16 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#71717a" }}
              interval={0}
              angle={-25}
              textAnchor="end"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickFormatter={(v) =>
                mode === "arr" ? fmtCompactEuro(v) : fmtCompactCount(v)
              }
              width={56}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#a3a3a3" }}
              tickFormatter={(v) =>
                mode === "arr" ? fmtCompactEuro(v) : fmtCompactCount(v)
              }
              width={56}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const v = payload[0]?.value as number;
                const c = payload[1]?.value as number;
                return (
                  <div className="bg-white dark:bg-[hsl(var(--surface-elevated))] border dark:border-white/[0.12] rounded-md shadow-md dark:shadow-pop px-2 py-1 text-xs">
                    <div className="font-medium">{label}</div>
                    <div className="text-zinc-700 tabular-nums">
                      Mois : {mode === "arr" ? fmtEuro(v) : fmtCompactCount(v)}
                    </div>
                    <div className="text-zinc-500 tabular-nums">
                      Cumul YTD : {mode === "arr" ? fmtEuro(c) : fmtCompactCount(c)}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="circle"
            />
            <Bar
              yAxisId="left"
              dataKey="value"
              fill="hsl(34, 32%, 52%)"
              radius={[4, 4, 0, 0]}
              name="Mois"
            >
              <LabelList
                dataKey="value"
                position="top"
                style={{ fontSize: 10, fill: "#52525b" }}
                formatter={(v: unknown) => {
                  const n = Number(v);
                  if (n === 0) return ""; // pas de label sur les barres à 0
                  return mode === "arr" ? fmtCompactEuro(n) : fmtCompactCount(n);
                }}
              />
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumul"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Cumul YTD"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ============================================================================
//  Top 10 clients
// ============================================================================

function TopClients({ topClients }: { topClients: DashboardData["topClients"] }) {
  const max = Math.max(...topClients.map((c) => c.arr ?? 0), 1);

  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 tracking-tight">Top 10 clients · ARR</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Clic = ouvre la fiche</p>
      </header>
      {topClients.length === 0 ? (
        <div className="text-xs text-zinc-400 text-center py-8">Aucun client actif.</div>
      ) : (
        <ul className="space-y-1.5">
          {topClients.map((c) => {
            const pct = ((c.arr ?? 0) / max) * 100;
            return (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.slug}`}
                  className="group/row block px-2 py-1.5 -mx-2 rounded-md hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    {/* Le texte reste foreground neutre au hover, pour rester
                        TOUJOURS lisible quelle que soit la couleur de la barre. */}
                    <span className="text-xs font-medium text-zinc-800 truncate group-hover/row:text-zinc-900 dark:group-hover/row:text-zinc-50">
                      {c.denomination}
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-700 shrink-0">
                      {fmtEuro(c.arr)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                    {/* Barre tres discrete en dark (la row du #1 fait 100pct
                        de width, donc une barre pleine ecraserait le texte). */}
                    <div
                      className="h-full bg-[hsl(var(--gold))]/70 dark:bg-[hsl(var(--gold))]/35 group-hover/row:bg-[hsl(var(--gold))]/85 dark:group-hover/row:bg-[hsl(var(--gold))]/50 transition-colors"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ============================================================================
//  Production à risque
// ============================================================================

function ProductionRisque({
  risque,
}: {
  risque: DashboardData["productionRisque"];
}) {
  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 tracking-tight">Production à risque</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Obligations non terminées</p>
      </header>
      <div className="space-y-2">
        <RisqueRow
          label="Échéances dépassées"
          value={risque.enRetard}
          color="rose"
          icon={<AlertTriangle className="h-4 w-4" />}
          href="/obligations"
        />
        <RisqueRow
          label="Échéance ≤ 7 jours"
          value={risque.sous7Jours}
          color="amber"
          icon={<Clock className="h-4 w-4" />}
          href="/obligations"
        />
        <RisqueRow
          label="Échéance ≤ 30 jours"
          value={risque.sous30Jours}
          color="blue"
          icon={<CalendarClock className="h-4 w-4" />}
          href="/obligations"
        />
      </div>
    </section>
  );
}

function RisqueRow({
  label,
  value,
  color,
  icon,
  href,
}: {
  label: string;
  value: number;
  color: "rose" | "amber" | "blue";
  icon: React.ReactNode;
  href: string;
}) {
  // Style Notion : fond neutre uniforme partout. Seule l'icone porte
  // la couleur du statut. Le label et la valeur restent en foreground
  // pour rester TOUJOURS lisibles, en light comme en dark.
  const iconColors = {
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    blue: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  } as const;
  const muted = value === 0;
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
        "border-zinc-200/70 dark:border-white/[0.08]",
        "bg-zinc-50/50 dark:bg-white/[0.02]",
        "hover:bg-zinc-100/60 dark:hover:bg-white/[0.05] hover:border-zinc-300 dark:hover:border-white/[0.16]"
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
          muted ? "bg-zinc-100 text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500" : iconColors[color]
        )}
      >
        {icon}
      </span>
      <span className={cn(
        "text-xs flex-1 font-medium",
        muted ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-200"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-xl font-semibold tabular-nums leading-none",
        muted ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-50"
      )}>
        {value}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

// ============================================================================
//  Mix activité (donut)
// ============================================================================

function MixActivite({ mixActivite }: { mixActivite: DashboardData["mixActivite"] }) {
  // Liste verticale type "Top clients", catégories métier MOON regroupées
  // (pas de libellés NAF bruts, pas de catégorie "Autres"). Les noms de
  // catégorie ne sont pas des filtres exploitables côté /clients : affichage
  // statistique seul, pas de lien cliquable.
  const max = Math.max(...mixActivite.map((m) => m.value), 1);
  // Palette MOON gold + neutres — barres tinted en fonction de l'index
  const BAR_TONES = [
    "bg-[hsl(34,32%,52%)]",       // gold MOON
    "bg-emerald-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-cyan-500",
    "bg-rose-500",
    "bg-lime-500",
    "bg-zinc-400",
  ];

  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 tracking-tight">Mix activité</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Répartition par secteur métier · clic pour voir les dossiers
        </p>
      </header>
      {mixActivite.length === 0 ? (
        <div className="text-xs text-zinc-400 text-center py-8">
          Pas de données.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {mixActivite.map((row, i) => {
            const pct = (row.value / max) * 100;
            const barColor = BAR_TONES[i % BAR_TONES.length];

            return (
              <li key={row.name}>
                <Link
                  href={`/clients?categorie=${encodeURIComponent(row.name)}`}
                  className="group/row block px-2 py-1.5 -mx-2 rounded-md hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate group-hover/row:text-zinc-900 dark:group-hover/row:text-zinc-50">
                      {row.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">
                      {row.value} dossier{row.value > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={cn(
                        "h-full opacity-70 dark:opacity-55 group-hover/row:opacity-95 dark:group-hover/row:opacity-80 transition-opacity",
                        barColor
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ============================================================================
//  Helpers
// ============================================================================

function shortLabel(statut: string): string {
  // Retire le préfixe "N - " (chiffre ou Z) pour gain de place
  return statut.replace(/^[0-9Z] - /, "");
}

/**
 * Format compact € pour les labels au-dessus des barres et l'axe Y.
 * - ≥ 1000 → "136 k€" (arrondi)
 * - < 1000 → "850 €" (sans décimales)
 * Séparateur de milliers FR (espace fine) pour cohérence.
 */
function fmtCompactEuro(n: number): string {
  if (!Number.isFinite(n)) return "0 €";
  if (Math.abs(n) >= 1000) {
    const k = Math.round(n / 1000);
    return `${k.toLocaleString("fr-FR")} k€`;
  }
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

/**
 * Format compact pour les compteurs (séparateur milliers).
 * Ex. 1234 → "1 234"
 */
function fmtCompactCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("fr-FR");
}

// Toggle segmenté Nb/€
function SegToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
            value === o.value
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-900"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Couleurs cohérence : la sidebar a déjà PIPELINE_COLORS, mais Recharts a besoin
// de hex. Le data loader fournit la couleur hex via `color`. PIPELINE_COLORS
// reste utilisé ailleurs (badges Tailwind).
void PIPELINE_COLORS;
