/**
 * Squelette de chargement générique, réutilisé par les `loading.tsx` des
 * routes qui n'ont pas de skeleton sur-mesure. But : afficher un retour
 * visuel INSTANTANÉ au clic (le contenu serveur arrive ensuite en streaming),
 * au lieu de figer l'ancienne page ou montrer un écran blanc.
 *
 * Les couleurs (bg-zinc-*) sont remappées automatiquement en dark/navy par
 * la couche de compat de globals.css, donc le skeleton suit le thème.
 *
 * Variantes pour limiter le layout shift selon la forme réelle de la page :
 *   - "list"   : en-tête + barre de filtres + lignes de tableau
 *   - "detail" : en-tête + grille de cartes
 *   - "form"   : en-tête + sections de formulaire empilées
 */
type Variant = "list" | "detail" | "form";

export function PageSkeleton({ variant = "detail" }: { variant?: Variant }) {
  return (
    <div className="space-y-5 animate-pulse">
      {/* En-tête : titre + sous-titre */}
      <div>
        <div className="h-7 w-44 bg-zinc-200 rounded mb-2" />
        <div className="h-4 w-72 bg-zinc-100 rounded" />
      </div>

      {variant === "list" && (
        <>
          <div className="h-11 bg-zinc-100 rounded-lg" />
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="h-10 bg-zinc-100 border-b" />
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-12 border-b last:border-b-0 bg-zinc-50/40" />
            ))}
          </div>
        </>
      )}

      {variant === "detail" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 h-24" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card p-4 h-64" />
            <div className="rounded-lg border bg-card p-4 h-64" />
          </div>
        </>
      )}

      {variant === "form" && (
        <div className="space-y-4 max-w-3xl">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="h-5 w-40 bg-zinc-200 rounded" />
              <div className="h-9 bg-zinc-100 rounded" />
              <div className="h-9 bg-zinc-100 rounded" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
