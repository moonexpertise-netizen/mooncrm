import { cn } from "@/lib/utils";

/** Carte standard avec titre. */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium mb-3 text-zinc-700">{title}</h3>
      {children}
    </div>
  );
}

/** Séparateur de section numéroté (Section 1 — Infos de base, etc.). */
export function SectionTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="pt-2 pb-1">
      <div className="flex items-baseline gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] text-xs font-semibold">
          {n}
        </span>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h2>
      </div>
      <p className="text-[11px] text-zinc-500 ml-8 mt-0.5">{sub}</p>
      <div className="h-px bg-zinc-200 mt-2" />
    </div>
  );
}

/** Champ en lecture seule (MRR, ARR, équivalent mensuel…). */
export function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,360px)] gap-2 py-1 text-sm items-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="px-2 py-1 -mx-2 rounded border border-zinc-200 bg-zinc-50 text-zinc-600 tabular-nums">
        {value}
      </div>
    </div>
  );
}

/** Pastille texte avec couleur optionnelle. */
export function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-medium border",
        color ?? "bg-zinc-100 text-zinc-700 border-zinc-200"
      )}
    >
      {text}
    </span>
  );
}

/** Regroupe un tableau par clé (utilisé pour onboarding par catégorie). */
export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}
