// Skeleton page Missions exceptionnelles : recap KPIs + toolbar + tableau.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-56 bg-zinc-200 dark:bg-white/[0.06] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))]" />
        ))}
      </div>
      <div className="h-20 rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))]" />
      <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-hidden">
        <div className="h-9 bg-zinc-50 dark:bg-white/[0.03] border-b" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-zinc-100 dark:border-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
