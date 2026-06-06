"use client";

/**
 * MobileFilterSelect : select natif compact pour les toolbars filtres
 * sur mobile. Remplace les rangees de chips qui wrappaient sur 3-4 lignes
 * et mangeaient toute la hauteur d'ecran.
 *
 * Usage type :
 *   <div className="md:hidden grid grid-cols-2 gap-2">
 *     <MobileFilterSelect label="Statut" value={...} onChange={...}
 *       options={[{ value: "all", label: "Tous (12)" }, ...]} />
 *     <MobileFilterSelect label="Tri" value={...} onChange={...} ... />
 *   </div>
 *   <div className="hidden md:flex md:gap-2">[chips existants]</div>
 *
 * Le wrapper layout est laisse a chaque page (grid 2 cols, 3 cols, etc.)
 * pour s'adapter au nombre de filtres et a l'importance relative de
 * chacun. Ce composant n'impose que le rendu d'UN select.
 */
export function MobileFilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  /** Label court affiche au-dessus du select (10px uppercase). */
  label: string;
  /** Valeur courante du select. */
  value: string;
  /** Callback lors du changement (recoit la nouvelle valeur brute). */
  onChange: (next: string) => void;
  /** Liste des options. Le label inclut idealement le compteur entre
   *  parentheses pour rester informatif sans une rangee de chips. */
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium px-0.5">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-white/[0.30] focus:ring-2 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.04] transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
