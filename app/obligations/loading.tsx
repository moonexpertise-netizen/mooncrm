export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-64 bg-zinc-200 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-zinc-100/40" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-zinc-100/40" />
        ))}
      </div>
    </div>
  );
}
