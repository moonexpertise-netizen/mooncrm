export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-zinc-200 rounded" />
      <div className="h-20 rounded-lg border bg-zinc-100/40" />
      <div className="rounded-lg border bg-card">
        <div className="h-10 bg-zinc-100 border-b" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-b last:border-b-0 bg-zinc-50/40" />
        ))}
      </div>
    </div>
  );
}
