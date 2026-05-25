// Skeleton du tracker obligations. Critique : c'est la page la plus consultée
// depuis le sous-menu Production (chaque clic sur "?type=..." re-fetch le RSC).
// Sans ce loading.tsx, on voyait du blanc à chaque switch de tracker.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 bg-zinc-200 rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-zinc-100 rounded" />
          <div className="h-8 w-16 bg-zinc-100 rounded" />
          <div className="h-8 w-16 bg-zinc-100 rounded" />
        </div>
      </div>
      {/* Toolbar */}
      <div className="rounded-lg border bg-card px-3 py-2">
        <div className="h-8 w-64 bg-zinc-100 rounded" />
      </div>
      {/* Tableau */}
      <div className="rounded-lg border bg-card">
        <div className="h-12 bg-zinc-100 border-b" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-11 border-b last:border-b-0 bg-zinc-50/40" />
        ))}
      </div>
    </div>
  );
}
