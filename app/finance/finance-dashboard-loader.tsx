"use client";

import dynamic from "next/dynamic";
import type { FinanceData } from "./finance-dashboard";

/**
 * Charge FinanceDashboard (gros composant + Recharts ~130 kB) en lazy côté
 * client. /finance était la route la plus lourde du CRM (Recharts dans le
 * bundle initial). Avec ce loader (next/dynamic ssr:false), Recharts sort du
 * first load JS de la route. Skeleton affiché le temps du chargement.
 */
const FinanceDashboard = dynamic(() => import("./finance-dashboard"), {
  ssr: false,
  loading: () => <FinanceSkeleton />,
});

function FinanceSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Hero : 3-4 grosses cards KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5 h-40" />
        ))}
      </div>
      {/* Timeline / atterrissage : grand graphe */}
      <div className="rounded-2xl border bg-card p-5 h-80" />
      {/* Deux blocs côte à côte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-5 h-72" />
        <div className="rounded-2xl border bg-card p-5 h-72" />
      </div>
    </div>
  );
}

export default function FinanceDashboardLoader({ data }: { data: FinanceData }) {
  return <FinanceDashboard data={data} />;
}
