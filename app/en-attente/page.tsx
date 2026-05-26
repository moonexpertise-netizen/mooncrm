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
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-zinc-50 via-white to-amber-50/40">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-modal p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 text-2xl border border-amber-200/60 shadow-card">
            ⏳
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900">
              Compte en attente d&apos;approbation
            </h1>
            <p className="text-sm text-zinc-600">
              Ton compte a bien été créé. Un administrateur doit l&apos;approuver
              avant que tu puisses accéder au CRM.
            </p>
            <p className="text-xs text-zinc-500 pt-1">
              Tu peux fermer cette page. Tu seras automatiquement redirigé vers
              l&apos;app dès que ton compte sera approuvé.
            </p>
          </div>

          <div className="pt-3">
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
