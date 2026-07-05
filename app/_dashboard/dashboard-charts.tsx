"use client";

import { useEffect, useRef, useState } from "react";
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
import { useTheme } from "@/app/_components/theme-provider";
import type { DashboardData } from "./dashboard-data";

/**
 * Couleurs de charts theme-aware. Avant : axes/labels en hex codé en dur
 * (#71717a / #52525b) ≈ 2:1 sur le fond dark #202020 → dashboard illisible
 * en dark ET navy. On dérive les teintes du thème résolu.
 */
function useChartColors() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return {
    axis: dark ? "#a1a1aa" : "#71717a", // zinc-400 / zinc-500
    label: dark ? "#d4d4d8" : "#52525b", // zinc-300 / zinc-600
    cursor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };
}

/**
 * Composant client du dashboard. Reçoit toutes les données pré-agrégées
 * en props et rend 5 sections de BI :
 *
 *  1. KPI cards top (4 indicateurs synthétiques)
 *  2. Pipeline funnel (bar chart cliquable)
 *  3. Signatures 12 mois (composed chart : barres + ligne cumul YTD)
 *  4. Top 10 clients par ARR (liste cliquable)
 *  5. Mix activité (donut)
 */
export default function DashboardCharts({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-5">
      <KpiCards kpi={data.kpi} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineFunnel pipeline={data.pipeline} />
        <SignaturesParMois signaturesParMois={data.signaturesParMois} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopClients topClients={data.topClients} />
        <MixActivite mixActivite={data.mixActivite} />
      </div>
    </div>
  );
}

// ============================================================================
//  KPI Cards
// ============================================================================

/**
 * Compteur animé : la valeur monte de 0 à sa cible en ~800ms (ease-out cubic)
 * au premier affichage. Respecte prefers-reduced-motion (valeur finale
 * directe). SSR-safe : le serveur rend la valeur finale (pas de mismatch),
 * l'animation ne démarre qu'au mount côté client — le départ à 0 est masqué
 * par l'entrée en cascade des cards (stagger-in).
 */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const animated = useRef(false);
  useEffect(() => {
    if (animated.current) {
      setDisplay(value); // valeur mise à jour après coup (refresh) : pas de re-animation
      return;
    }
    animated.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      setDisplay(value);
      return;
    }
    const DUR = 800;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(Math.round(display))}</>;
}

function KpiCards({ kpi }: { kpi: DashboardData["kpi"] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-in">
      <KpiCard
        label="Clients"
        value={<CountUp value={kpi.clientsActifs} format={(n) => n.toString()} />}
        sub="LDM signée uniquement"
        icon={<Users className="h-5 w-5" />}
        href="/clients?bucket=clients"
        tone="neutral"
      />
      <KpiCard
        label="MRR"
        value={<CountUp value={kpi.mrr} format={(n) => fmtEuro(n) ?? "-"} />}
        sub={`ARR ${fmtEuro(kpi.arr)}`}
        icon={<TrendingUp className="h-5 w-5" />}
        tone="gold"
      />
      <KpiCard
        label="Signatures du mois"
        value={<CountUp value={kpi.signaturesCeMois} format={(n) => n.toString()} />}
        sub={`${fmtEuro(kpi.arrSigneCeMois)} ARR signé`}
        icon={<CalendarClock className="h-5 w-5" />}
        tone="emerald"
      />
      <KpiCard
        label="Panier moyen"
        value={
          kpi.clientsActifs > 0 ? (
            <CountUp
              value={Math.round(kpi.arr / kpi.clientsActifs)}
              format={(n) => fmtEuro(n) ?? "-"}
            />
          ) : (
            "-"
          )
        }
        sub="ARR moyen par client (LDM signée)"
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
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  tone?: KpiTone;
}) {
  const toneClass = KPI_TONE[tone];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
            toneClass.icon
          )}
        >
          {icon}
        </span>
      </div>
      <div className="font-display text-3xl md:text-[32px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums leading-none">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-2 truncate">{sub}</div>
      )}
    </>
  );
  const base =
    "block rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card hover:shadow-card-hover p-4 md:p-5 transition-all";
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
  const cc = useChartColors();

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
    <section className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-4 md:p-5">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Pipeline
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Clique sur une barre pour filtrer les clients
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
          <BarChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 30 }}>
            <XAxis
              dataKey="name"
              angle={-25}
              textAnchor="end"
              interval={0}
              tick={{ fontSize: 10, fill: cc.axis }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: cc.axis }}
              tickFormatter={(v) =>
                mode === "arr" ? fmtCompactEuro(v) : fmtCompactCount(v)
              }
              width={56}
            />
            <Tooltip
              cursor={{ fill: cc.cursor }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { full: string; value: number };
                return (
                  <div className="rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-pop px-2.5 py-1.5 text-xs">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{p.full}</div>
                    <div className="text-muted-foreground tabular-nums">
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
                style={{ fontSize: 10, fill: cc.label }}
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
  const cc = useChartColors();

  const data = signaturesParMois.map((m) => ({
    month: m.monthLabel,
    value: mode === "count" ? m.count : m.arr,
    cumul: mode === "count" ? m.cumulCountYtd : m.cumulArrYtd,
  }));

  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-4 md:p-5">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Signatures sur 12 mois
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Barres = mois, ligne = cumul YTD (reset au 1er janvier)
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
              tick={{ fontSize: 10, fill: cc.axis }}
              interval={0}
              angle={-25}
              textAnchor="end"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: cc.axis }}
              tickFormatter={(v) =>
                mode === "arr" ? fmtCompactEuro(v) : fmtCompactCount(v)
              }
              width={56}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: cc.axis }}
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
                  <div className="rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-pop px-2.5 py-1.5 text-xs">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{label}</div>
                    <div className="text-zinc-700 dark:text-zinc-300 tabular-nums">
                      Mois : {mode === "arr" ? fmtEuro(v) : fmtCompactCount(v)}
                    </div>
                    <div className="text-muted-foreground tabular-nums">
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
                style={{ fontSize: 10, fill: cc.label }}
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
              // sky (et non #10b981 vert = couleur "LDM signée") : evite la
              // confusion entre la ligne de cumul et le statut signe.
              stroke="#0ea5e9"
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
    <section className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-4 md:p-5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Top 10 clients par ARR
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Clic = ouvre la fiche</p>
      </header>
      {topClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <Users className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mt-3">
            Aucun client actif
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Les clients en LDM signée apparaîtront ici.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {topClients.map((c, i) => {
            const pct = ((c.arr ?? 0) / max) * 100;
            return (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.slug}`}
                  className="group/row block px-2 py-1.5 -mx-2 rounded-md hover:bg-zinc-50/70 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    {/* Le texte reste foreground neutre au hover, pour rester
                        TOUJOURS lisible quelle que soit la couleur de la barre. */}
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover/row:text-zinc-900 dark:group-hover/row:text-zinc-50">
                      {c.denomination}
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300 shrink-0">
                      {fmtEuro(c.arr)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
                    {/* Barre tres discrete en dark (la row du #1 fait 100pct
                        de width, donc une barre pleine ecraserait le texte). */}
                    <div
                      className="h-full bg-[hsl(var(--gold))]/70 dark:bg-[hsl(var(--gold))]/35 group-hover/row:bg-[hsl(var(--gold))]/85 dark:group-hover/row:bg-[hsl(var(--gold))]/50 transition-colors animate-bar-grow"
                      style={{ width: `${pct}%`, animationDelay: `${i * 45}ms` }}
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
//  Mix activité (donut)
// ============================================================================

function MixActivite({ mixActivite }: { mixActivite: DashboardData["mixActivite"] }) {
  // Liste verticale type "Top clients", catégories métier MOON regroupées
  // (pas de libellés NAF bruts, pas de catégorie "Autres"). Les noms de
  // catégorie ne sont pas des filtres exploitables côté /clients : affichage
  // statistique seul, pas de lien cliquable.
  const max = Math.max(...mixActivite.map((m) => m.value), 1);
  // Palette MOON gold + neutres - barres tinted en fonction de l'index
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
    <section className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-4 md:p-5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Mix activité
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Répartition par secteur métier, clic pour voir les dossiers
        </p>
      </header>
      {mixActivite.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <TrendingUp className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mt-3">
            Pas de données
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            La répartition par secteur s&apos;affichera ici.
          </p>
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
                  className="group/row block px-2 py-1.5 -mx-2 rounded-md hover:bg-zinc-50/70 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate group-hover/row:text-zinc-900 dark:group-hover/row:text-zinc-50">
                      {row.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                      {row.value} dossier{row.value > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className={cn(
                        "h-full opacity-70 dark:opacity-55 group-hover/row:opacity-95 dark:group-hover/row:opacity-80 transition-opacity animate-bar-grow",
                        barColor
                      )}
                      style={{ width: `${pct}%`, animationDelay: `${i * 45}ms` }}
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
    <div className="inline-flex shrink-0 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.04] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors",
            value === o.value
              ? "bg-white dark:bg-white/[0.10] text-zinc-900 dark:text-zinc-50 shadow-sm"
              : "text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
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
