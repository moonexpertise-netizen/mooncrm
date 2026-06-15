// Skeleton page Facturation : KPIs en haut + table en bas. Evite l'ecran blanc
// pendant que les 6 sources s'agregent cote serveur.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-48 bg-zinc-200 dark:bg-white/[0.06] rounded" />
      <div className="h-4 w-96 bg-zinc-100 dark:bg-white/[0.04] rounded" />
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))]" />
        ))}
      </div>
      {/* Toolbar */}
      <div className="h-12 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))]" />
      {/* Tableau */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] overflow-hidden">
        <div className="h-9 bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-100 dark:border-white/[0.06]" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-zinc-100 dark:border-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
