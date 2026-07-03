import { cn } from "@/lib/utils";

/**
 * En-tête de page standard du CRM.
 *
 *   <PageHeader title="Clients" description="Liste des dossiers" actions={...} />
 *
 * Hiérarchie typographique :
 *   - title       : text-2xl font-semibold tracking-tight (24px, lh 30)
 *   - description : text-sm text-muted-foreground (14px)
 *   - actions     : zone de droite alignée à la baseline du titre
 *
 * Espacement : padding-bottom mb-4 cohérent avec le reste des pages.
 *
 * Composant Server (pas de "use client") → peut être utilisé partout, y
 * compris dans des Server Components.
 */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // animate-slide-up-fade : le titre "atterrit" en douceur à chaque
        // navigation (160ms, ease-out premium) — cohérent sur tout le site.
        "flex items-start justify-between gap-3 flex-wrap animate-slide-up-fade",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-xl md:text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[12px] md:text-[13px] text-muted-foreground mt-1 leading-snug">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}

/**
 * Sous-titre de section dans une page (équivalent h2).
 *
 *   <SectionTitle eyebrow="Étape 1" title="Identité" description="..." />
 *
 * Plus discret que PageHeader, sert à séparer des blocs au sein d'une page.
 */
export function SectionTitle({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 flex-wrap", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-1">
            {eyebrow}
          </div>
        )}
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
          {title}
        </h2>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
