import { Workflow } from "lucide-react";

export default function OnboardingPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Parcours d'intégration des nouveaux clients.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-10 text-center">
        <Workflow className="h-10 w-10 mx-auto text-zinc-400" />
        <div className="mt-3 text-sm font-medium text-zinc-700">Module à venir</div>
        <p className="text-xs text-muted-foreground mt-1">
          La checklist d'onboarding et le suivi des étapes seront ajoutés ici.
        </p>
      </div>
    </div>
  );
}
