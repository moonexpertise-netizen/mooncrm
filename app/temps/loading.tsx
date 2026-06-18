export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-40 rounded bg-zinc-200/70 dark:bg-white/[0.06]" />
      <div className="h-9 w-72 rounded bg-zinc-200/70 dark:bg-white/[0.06]" />
      <div className="h-20 rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" />
      <div className="h-32 rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" />
    </div>
  );
}
