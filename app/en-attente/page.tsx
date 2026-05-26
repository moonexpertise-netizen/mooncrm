import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

/**
 * Page affichée aux users dont le profile.approved = false.
 * Le middleware redirige tous leurs accès ici, sauf /login (logout possible).
 * Une fois approuvés par un admin, ils accèdent normalement à l'app.
 *
 * Sécurité : on n'affiche pas l'email de l'utilisateur (info exploitable
 * par un attaquant qui regarde l'écran).
 */
export default function EnAttentePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-700 text-2xl">
          ⏳
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Compte en attente d&apos;approbation
          </h1>
          <p className="text-sm text-muted-foreground">
            Ton compte a bien été créé. Un administrateur doit l&apos;approuver
            avant que tu puisses accéder au CRM.
          </p>
          <p className="text-xs text-muted-foreground pt-2">
            Tu peux fermer cette page. Tu seras automatiquement redirigé vers
            l&apos;app dès que ton compte sera approuvé.
          </p>
        </div>

        <div className="pt-4">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
