import OnboardingTabs from "./onboarding-tabs";

/**
 * Layout commun aux vues onboarding (Liste / Matrice).
 *
 * Affiche le titre + un sélecteur d'onglet client (qui synchronise via URL).
 * Les sous-pages (page.tsx = liste, matrice/page.tsx = matrice) se contentent
 * de rendre leur contenu spécifique.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Suivi de l&apos;intégration des nouveaux dossiers · dossiers signés / internes / sous-traitance
        </p>
      </div>
      <OnboardingTabs />
      {children}
    </div>
  );
}
