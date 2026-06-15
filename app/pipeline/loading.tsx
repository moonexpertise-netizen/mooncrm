// Skeleton du kanban pipeline. Affiché instantanément au clic dans la sidebar
// pendant que le RSC fetch les cards. Évite le "blanc" entre 2 pages.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-40 bg-zinc-200 dark:bg-white/10 rounded-lg" />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden h-[500px]"
          >
            <div className="h-10 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03]" />
            <div className="p-2 space-y-1.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <div
                  key={j}
                  className="h-8 rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
