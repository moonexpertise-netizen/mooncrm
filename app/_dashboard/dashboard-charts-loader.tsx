"use client";

import dynamic from "next/dynamic";
import type { DashboardData } from "./dashboard-data";

/**
 * Wrapper qui charge `DashboardCharts` (Recharts ~50 kB) en lazy depuis le
 * client. Évite que Recharts soit inclus dans le bundle initial de la page
 * d'accueil. Skeleton de meilleure qualité que le `loading.tsx` global.
 */
const DashboardCharts = dynamic(() => import("./dashboard-charts"), {
  ssr: false,
  loading: () => <DashboardSkeleton />,
});

function DashboardSkeleton() {
  const card =
    "rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card";
  return (
    <div className="space-y-5 animate-pulse">
      {/* KPI cards row : 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${card} h-[108px]`} />
        ))}
      </div>
      {/* Two charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${card} h-80`} />
        <div className={`${card} h-80`} />
      </div>
      {/* Top clients + mix activité */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${card} h-64`} />
        <div className={`${card} h-64`} />
      </div>
    </div>
  );
}

export default function DashboardChartsLoader({ data }: { data: DashboardData }) {
  return <DashboardCharts data={data} />;
}
