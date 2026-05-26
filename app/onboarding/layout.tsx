import { PageHeader } from "../_components/page-header";
import OnboardingTabs from "./onboarding-tabs";

/**
 * Layout commun aux vues onboarding (Liste / Matrice / Paramétrage).
 * Titre + onglets stables au-dessus du contenu de chaque sous-route.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Onboarding"
        description="Suivi de l'intégration des nouveaux dossiers · signés / internes / sous-traitance"
      />
      <OnboardingTabs />
      {children}
    </div>
  );
}
