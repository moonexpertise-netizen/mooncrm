/**
 * Mappe un code NAF/APE (ex. "69.20Z", "62.01") vers une activité libellée
 * cohérente avec les usages MOON. On essaie d'abord un match spécifique sur
 * 4 chiffres (NN.NN), puis on retombe sur la division (NN).
 *
 * Utilisé par :
 *  - le form de création client (auto-fill au pick d'une suggestion annuaire)
 *  - le bouton "Annuaire" sur la fiche client (re-récup post-création)
 *
 * Renvoie 'AUTRE' si aucune correspondance dans la table, ou null si pas de
 * code NAF fourni.
 */
export function activiteFromNaf(naf: string | null | undefined): string | null {
  if (!naf) return null;
  const code = naf.toUpperCase().replace(/\s/g, "");
  const prefix4 = code.substring(0, 5); // ex. "69.20"
  const div = code.substring(0, 2);

  // Matches spécifiques (préfixe NN.NN)
  const specific: Record<string, string> = {
    "69.20": "EXPERTISE COMPTABLE",
    "69.10": "AVOCAT",
    "70.22": "CONSULTANT",
    "70.21": "COMMUNICATION",
    "74.10": "DESIGN",
    "74.20": "PHOTOGRAPHE",
    "74.30": "TRADUCTION",
    "74.90": "CONSULTANT",
    "73.11": "MARKETING",
    "73.12": "MARKETING",
    "63.11": "INFORMATIQUE",
    "63.12": "INFORMATIQUE",
    "58.21": "INFORMATIQUE",
    "58.29": "INFORMATIQUE",
    "62.01": "INFORMATIQUE",
    "62.02": "INFORMATIQUE",
    "62.03": "INFORMATIQUE",
    "62.09": "INFORMATIQUE",
    "59.11": "AUDIOVISUEL",
    "59.12": "AUDIOVISUEL",
    "59.20": "AUDIOVISUEL",
    "60.10": "AUDIOVISUEL",
    "60.20": "AUDIOVISUEL",
    "47.11": "COMMERCE",
    "47.19": "COMMERCE",
    "47.91": "E-COMMERCE",
    "56.10": "RESTAURATION",
    "56.21": "RESTAURATION",
    "56.30": "RESTAURATION",
    "55.20": "LOCATION MEUBLEE",
    "68.20": "IMMOBILIER",
    "68.31": "AGENT IMMOBILIER",
    "68.32": "IMMOBILIER",
    "10.71": "BOULANGERIE",
    "96.02": "COIFFURE",
    "96.04": "ESTHETIQUE",
    "86.10": "MEDICAL",
    "86.21": "MEDICAL",
    "86.22": "MEDICAL",
    "86.23": "DENTISTE",
    "86.90": "PARAMEDICAL",
    "85.10": "FORMATION",
    "85.20": "FORMATION",
    "85.31": "FORMATION",
    "85.32": "FORMATION",
    "85.41": "FORMATION",
    "85.42": "FORMATION",
    "85.59": "FORMATION",
    "85.60": "FORMATION",
    "41.10": "IMMOBILIER",
    "41.20": "BTP",
    "43.21": "BTP",
    "43.22": "BTP",
    "43.31": "BTP",
    "43.32": "BTP",
    "43.33": "BTP",
    "43.34": "BTP",
    "43.39": "BTP",
    "43.99": "BTP",
    "75.00": "PARAMEDICAL",
    "93.11": "COACHING SPORTIF",
    "93.12": "COACHING SPORTIF",
    "93.13": "COACHING SPORTIF",
    "93.19": "COACHING SPORTIF",
    "94.11": "ASSOCIATION",
    "94.12": "ASSOCIATION",
    "94.99": "ASSOCIATION",
    "64.20": "HOLDING",
    "64.30": "INVESTISSEMENT",
    "64.99": "INVESTISSEMENT",
    "66.30": "INVESTISSEMENT",
    "66.19": "INVESTISSEMENT",
  };
  if (specific[prefix4]) return specific[prefix4];

  // Fallback par division (NN)
  const byDiv: Record<string, string> = {
    "01": "AGRICULTURE", "02": "AGRICULTURE", "03": "AGRICULTURE",
    "10": "COMMERCE", "11": "COMMERCE", "12": "COMMERCE", "13": "COMMERCE", "14": "COMMERCE", "15": "COMMERCE",
    "16": "ARTISAN", "17": "ARTISAN", "18": "ARTISAN",
    "23": "BTP", "24": "BTP", "25": "ARTISAN",
    "26": "INFORMATIQUE", "27": "INFORMATIQUE",
    "35": "ENERGIES", "36": "ENERGIES", "37": "ENERGIES", "38": "ENERGIES", "39": "ENERGIES",
    "41": "BTP", "42": "BTP", "43": "BTP",
    "45": "COMMERCE", "46": "COMMERCE", "47": "COMMERCE",
    "49": "TRANSPORT", "50": "TRANSPORT", "51": "TRANSPORT", "52": "TRANSPORT", "53": "TRANSPORT",
    "55": "RESTAURATION", "56": "RESTAURATION",
    "58": "AUDIOVISUEL", "59": "AUDIOVISUEL", "60": "AUDIOVISUEL",
    "61": "INFORMATIQUE", "62": "INFORMATIQUE", "63": "INFORMATIQUE",
    "64": "INVESTISSEMENT", "65": "INVESTISSEMENT", "66": "INVESTISSEMENT",
    "68": "IMMOBILIER",
    "69": "CONSULTANT",
    "70": "CONSULTANT",
    "71": "ARCHITECTE", "72": "CONSULTANT",
    "73": "MARKETING", "74": "CONSULTANT",
    "77": "COMMERCE", "78": "CONSULTANT", "79": "COMMERCE",
    "85": "FORMATION",
    "86": "MEDICAL", "87": "MEDICAL", "88": "MEDICAL",
    "90": "AUDIOVISUEL", "91": "AUDIOVISUEL", "92": "AUDIOVISUEL", "93": "BIEN-ETRE",
    "94": "ASSOCIATION", "95": "ARTISAN", "96": "BIEN-ETRE",
  };
  return byDiv[div] ?? "AUTRE";
}
