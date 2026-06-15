import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n);

export const fmtEuro = (n: number | null | undefined) => {
  if (n == null) return "-";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

export const fmtDateFr = (d: string | null | undefined) => {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR").format(date);
};

// Couleurs par statut logique (badges, dots, etc.)
export const STATUT_COLORS = {
  A_FAIRE: "bg-amber-100 text-amber-800 border-amber-200",
  EN_COURS: "bg-blue-100 text-blue-800 border-blue-200",
  TERMINE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NON_APPLICABLE: "bg-zinc-100 text-zinc-600 border-zinc-200",
} as const;

// Surcharges optionnelles : si une status_options a une `color` explicite,
// on utilise cette palette au lieu de celle du statut_logique.
export const CUSTOM_STATUS_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-800 border-red-300",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  violet: "bg-violet-100 text-violet-800 border-violet-200",
  zinc: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

/** Renvoie la classe Tailwind d'un statut, en respectant la couleur custom si fournie. */
export function statutColorClass(
  statutLogique: keyof typeof STATUT_COLORS | null,
  customColor?: string | null
): string {
  if (customColor && CUSTOM_STATUS_COLORS[customColor]) {
    return CUSTOM_STATUS_COLORS[customColor];
  }
  if (statutLogique) return STATUT_COLORS[statutLogique];
  return "bg-zinc-100 text-zinc-500 border-zinc-200";
}

export const PIPELINE_COLORS: Record<string, string> = {
  "1 - Tally à envoyer": "bg-amber-100 text-amber-800 border-amber-200",
  "2 - Tally à compléter": "bg-amber-100 text-amber-800 border-amber-200",
  "3 - PC à préparer": "bg-sky-100 text-sky-800 border-sky-200",
  "4 - PC envoyée": "bg-sky-100 text-sky-800 border-sky-200",
  "5 - PC acceptée": "bg-violet-100 text-violet-800 border-violet-200",
  "6 - LDM envoyée": "bg-violet-100 text-violet-800 border-violet-200",
  "7 - LDM signée": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Z - Interne": "bg-amber-100 text-amber-800 border-amber-300",
  "Z - Sous-traitance": "bg-sky-100 text-sky-800 border-sky-300",
  // Limbo : propal envoyee, jamais repondu, susceptible de revenir.
  // Indigo pour evoquer l'espace / l'attente, distinct du rose des
  // perdus definitifs.
  "Z - Perdu dans l'espace": "bg-indigo-100 text-indigo-800 border-indigo-300",
  "Z - Prospect perdu": "bg-rose-100 text-rose-800 border-rose-300",
  "Z - Résiliée": "bg-rose-100 text-rose-800 border-rose-300",
};
