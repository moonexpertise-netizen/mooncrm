import { loadDashboardData } from "./_dashboard/dashboard-data";
import DashboardCharts from "./_dashboard/dashboard-charts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Vue d&apos;ensemble · pipeline, signatures, production
        </p>
      </div>
      <DashboardCharts data={data} />
    </div>
  );
}
