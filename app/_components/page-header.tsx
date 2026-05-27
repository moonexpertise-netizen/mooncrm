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
        "flex items-start justify-between gap-3 flex-wrap",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
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
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
