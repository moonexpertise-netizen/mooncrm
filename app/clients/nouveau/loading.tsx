export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse max-w-2xl">
      <div className="h-8 w-56 bg-zinc-200 rounded" />
      <div className="rounded-lg border bg-card p-6 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[140px_1fr] gap-2 items-center">
            <div className="h-4 w-24 bg-zinc-200 rounded" />
            <div className="h-9 bg-zinc-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
