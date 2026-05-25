export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-zinc-200 rounded" />
      <div className="rounded-lg border bg-card p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 bg-zinc-50 rounded" />
        ))}
      </div>
    </div>
  );
}
