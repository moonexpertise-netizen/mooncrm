import { cn } from "@/lib/utils";

/**
 * Card premium (refonte v2) - fiche client.
 *
 * Header avec titre + (optionnel) sous-titre + (optionnel) action à droite.
 * Style Linear / Attio : rounded-2xl, border-zinc-200/70, shadow-card,
 * header sur fond très légèrement teinté pour le détacher du corps.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white dark:bg-[hsl(var(--card))] border border-zinc-200/70 dark:border-white/[0.08] shadow-card overflow-hidden",
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02]">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("p-5 space-y-1", bodyClassName)}>{children}</div>
    </div>
  );
}

/**
 * Séparateur de section premium (Section 1 - Infos de base, etc.).
 *
 * Style Linear : eyebrow numéroté en pastille gold, titre large, line accent
 * sous le titre. Pas une simple bordure plate - un vrai séparateur visuel.
 */
export function SectionTitle({
  n,
  title,
  sub,
}: {
  n: number;
  title: string;
  sub: string;
}) {
  return (
    <div className="pt-3 pb-1">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[hsl(var(--gold))]/20 to-[hsl(var(--gold))]/5 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] text-xs font-bold tracking-tight border border-[hsl(var(--gold))]/20 shadow-card">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">
            {title}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{sub}</p>
        </div>
      </div>
    </div>
  );
}

/** Champ en lecture seule (MRR, ARR, équivalent mensuel…). */
export function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,360px)] gap-1 sm:gap-2 py-1.5 sm:py-1 text-sm sm:items-center">
      <div className="text-xs sm:text-sm text-zinc-500">{label}</div>
      <div className="px-3 py-2 sm:px-2 sm:py-1 min-h-[36px] sm:min-h-0 rounded-md border border-zinc-100 bg-zinc-50/60 text-zinc-700 tabular-nums text-sm flex items-center">
        {value}
      </div>
    </div>
  );
}

/** Pastille texte avec couleur optionnelle. */
export function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-medium border",
        color ?? "bg-zinc-100 text-zinc-700 border-zinc-200"
      )}
    >
      {text}
    </span>
  );
}

/** Regroupe un tableau par clé (utilisé pour onboarding par catégorie). */
export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}
