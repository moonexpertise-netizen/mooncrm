"use client";

/**
 * Mini pastilles P (Pappers) / I (INPI) à coller au nom d'un dossier.
 * Lien direct préchargé à partir du SIREN. Masquées si SIREN absent ou "EN COURS".
 */
export function PappersInpiBadges({
  siren,
  size = "sm",
}: {
  siren: string | null | undefined;
  size?: "sm" | "xs";
}) {
  if (!siren || siren === "EN COURS") return null;
  const dim = size === "xs" ? "w-3.5 h-3.5 text-[8px]" : "w-4 h-4 text-[9px]";
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <a
        href={`https://www.pappers.fr/entreprise/${siren}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center ${dim} rounded font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200 transition-colors leading-none`}
        title="Voir sur Pappers"
      >
        P
      </a>
      <a
        href={`https://data.inpi.fr/entreprises/${siren}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center ${dim} rounded font-bold bg-pink-100 text-pink-700 hover:bg-pink-200 border border-pink-200 transition-colors leading-none`}
        title="Voir sur INPI"
      >
        I
      </a>
      <a
        href={`https://cfspro-idp.impots.gouv.fr/#mc_siren=${siren}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          // SIREN dans le presse-papiers : repli manuel (Ctrl+V) si le
          // userscript Tampermonkey n'est pas installé sur ce poste.
          navigator.clipboard?.writeText(siren).catch(() => {});
        }}
        className={`inline-flex items-center justify-center ${dim} rounded font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200 transition-colors leading-none`}
        title="Espace pro impots.gouv (SIREN copié)"
      >
        T
      </a>
    </span>
  );
}
