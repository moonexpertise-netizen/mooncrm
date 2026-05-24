import { TrendingUp } from "lucide-react";

export default function EconomiePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Économie</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Indicateurs financiers · abonnements, MRR, encaissements.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-10 text-center">
        <TrendingUp className="h-10 w-10 mx-auto text-zinc-400" />
        <div className="mt-3 text-sm font-medium text-zinc-700">Module à venir</div>
        <p className="text-xs text-muted-foreground mt-1">
          L'analyse économique du portefeuille client sera disponible prochainement.
        </p>
      </div>
    </div>
  );
}
