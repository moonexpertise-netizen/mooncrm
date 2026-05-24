export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-32 bg-zinc-200 rounded" />
      <div className="space-y-2">
        <div className="h-8 w-72 bg-zinc-200 rounded" />
        <div className="h-3 w-96 bg-zinc-200 rounded" />
      </div>
      <div className="h-10 border-b" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 rounded-lg border bg-zinc-100/40" />
        <div className="h-64 rounded-lg border bg-zinc-100/40" />
      </div>
    </div>
  );
}
