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
  return (
    <div className="space-y-5 animate-pulse">
      {/* KPI cards row : 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 h-24" />
        ))}
      </div>
      {/* Pipeline funnel */}
      <div className="rounded-lg border bg-card p-4 h-72" />
      {/* Two charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 h-72" />
        <div className="rounded-lg border bg-card p-4 h-72" />
      </div>
      {/* Mix activité + risque */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 h-64" />
        <div className="rounded-lg border bg-card p-4 h-64" />
      </div>
    </div>
  );
}

export default function DashboardChartsLoader({ data }: { data: DashboardData }) {
  return <DashboardCharts data={data} />;
}
