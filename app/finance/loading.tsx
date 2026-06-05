// Skeleton page Finance : KPIs + plusieurs sections (signatures, top clients,
// mix activite, etc.). Sans ce skeleton, ecran blanc 500-800ms vu le volume
// de queries.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-32 bg-zinc-200 dark:bg-white/[0.06] rounded" />
      {/* 4 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))]" />
        ))}
      </div>
      {/* 2 charts cote a cote */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-80 rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))]" />
        ))}
      </div>
      {/* 2 sections en bas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))]" />
        ))}
      </div>
    </div>
  );
}
