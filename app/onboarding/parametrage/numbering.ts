/**
 * Numérotation des étapes dans l'éditeur de parcours.
 *
 * Une rubrique a un `numbering_style` (decimal / alpha / roman / none) et un
 * flag `numbering_reset` (true = recommence à 1 dans cette rubrique, false =
 * continue le compteur de la rubrique précédente).
 *
 * Les étapes sans rubrique sont numérotées en décimal continu (compteur 1, 2, …).
 */

export type NumberingStyle = "decimal" | "alpha" | "roman" | "none";

export function formatNumber(n: number, style: NumberingStyle): string {
  if (style === "none") return "";
  if (style === "alpha") return toAlpha(n);
  if (style === "roman") return toRoman(n);
  return String(n);
}

// 1 → A, 2 → B, …, 26 → Z, 27 → AA, 28 → AB
function toAlpha(n: number): string {
  if (n <= 0) return "";
  let s = "";
  let cur = n;
  while (cur > 0) {
    cur -= 1;
    s = String.fromCharCode(65 + (cur % 26)) + s;
    cur = Math.floor(cur / 26);
  }
  return s;
}

function toRoman(n: number): string {
  if (n <= 0) return "";
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}
