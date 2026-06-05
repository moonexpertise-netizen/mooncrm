// Skeleton page CAA : tableau matrix par client x annee.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-24 bg-zinc-200 dark:bg-white/[0.06] rounded" />
      <div className="h-12 rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))]" />
      <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-hidden">
        <div className="h-10 bg-zinc-50 dark:bg-white/[0.03] border-b" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-zinc-100 dark:border-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
