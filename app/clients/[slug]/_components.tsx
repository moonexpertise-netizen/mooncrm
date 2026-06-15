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
        "rounded-xl bg-white dark:bg-[hsl(var(--card))] border border-zinc-200/70 dark:border-white/[0.08] shadow-card overflow-hidden",
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02]">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("p-4 md:p-5 space-y-1", bodyClassName)}>{children}</div>
    </div>
  );
}

/**
 * Séparateur de section (Section 1 - Infos de base, etc.).
 *
 * Eyebrow numéroté en pastille gold discrète + titre de section au standard
 * (text-sm font-semibold). Sert à séparer les grandes régions de la fiche.
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
    <div className="pt-2 pb-1">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] text-[11px] font-semibold tabular-nums border border-[hsl(var(--gold))]/20">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
            {title}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}

/** Champ en lecture seule (MRR, ARR, équivalent mensuel…). */
export function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,360px)] gap-1 sm:gap-2 py-1.5 sm:py-1 text-sm sm:items-center">
      <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
      <div className="px-3 py-2 sm:px-2 sm:py-1 min-h-[36px] sm:min-h-0 rounded-md border border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 tabular-nums text-sm flex items-center">
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
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border",
        color ?? "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:border-white/[0.10]"
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
