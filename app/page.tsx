import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Vue d'ensemble de l'activité MOON Expertise.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-10 text-center">
        <LayoutDashboard className="h-10 w-10 mx-auto text-zinc-400" />
        <div className="mt-3 text-sm font-medium text-zinc-700">Module à venir</div>
        <p className="text-xs text-muted-foreground mt-1">
          Les indicateurs synthétiques (production, économie, clients) seront rassemblés ici.
        </p>
      </div>
    </div>
  );
}
