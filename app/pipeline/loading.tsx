// Skeleton du kanban pipeline. Affiché instantanément au clic dans la sidebar
// pendant que le RSC fetch les cards. Évite le "blanc" entre 2 pages.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-40 bg-zinc-200 rounded" />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card h-[500px]">
            <div className="h-10 border-b bg-zinc-100/60 rounded-t-lg" />
            <div className="p-1.5 space-y-1">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-7 rounded border bg-zinc-50/60" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
