export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-zinc-200 dark:bg-white/[0.08]" />
      <div className="h-20 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-zinc-100/40 dark:bg-white/[0.03]" />
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden">
        <div className="h-10 bg-zinc-100 dark:bg-white/[0.04] border-b border-zinc-100 dark:border-white/[0.06]" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-b last:border-b-0 border-zinc-100 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02]" />
        ))}
      </div>
    </div>
  );
}
