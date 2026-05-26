// Loading global du dashboard /. Matche le shape réel (KPI cards 2x4 + funnel
// + 2 charts side-by-side + 2 cards bas) pour éviter le layout shift.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-7 w-40 bg-zinc-200 rounded mb-2" />
        <div className="h-4 w-72 bg-zinc-100 rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 h-24" />
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4 h-72" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 h-72" />
        <div className="rounded-lg border bg-card p-4 h-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 h-64" />
        <div className="rounded-lg border bg-card p-4 h-64" />
      </div>
    </div>
  );
}
