import { loadDashboardData } from "./_dashboard/dashboard-data";
import DashboardChartsLoader from "./_dashboard/dashboard-charts-loader";
import { PageHeader } from "./_components/page-header";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Vue d'ensemble du portefeuille · pipeline, signatures, production"
      />
      <DashboardChartsLoader data={data} />
    </div>
  );
}
