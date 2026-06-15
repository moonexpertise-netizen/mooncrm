export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-zinc-200 dark:bg-white/[0.08]" />
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card p-4 md:p-5 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded-md bg-zinc-100 dark:bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
