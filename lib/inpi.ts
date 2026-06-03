/**
 * Client API INPI RNE (Registre National des Entreprises).
 * Documentation : https://registre-national-entreprises.inpi.fr/api/
 *
 * Workflow :
 *  1. Auth : POST /sso/login avec username/password → JWT token (valable ~1h)
 *  2. GET /companies/{siren} avec Authorization: Bearer <token>
 *
 * Variables d'env requises (dans .env.local) :
 *   INPI_USERNAME=ton.email@example.com
 *   INPI_PASSWORD=tonMotDePasse
 *
 * Inscription gratuite : https://data.inpi.fr/ → "Créer un compte"
 */

const INPI_BASE = "https://registre-national-entreprises.inpi.fr/api";

export class InpiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "InpiError";
  }
}

/** Cache en mémoire du JWT (renouvelé à expiration). */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  // Cache valable 50 min (le JWT INPI vit ~1h)
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const username = process.env.INPI_USERNAME;
  const password = process.env.INPI_PASSWORD;
  if (!username || !password) {
    throw new InpiError(
      "INPI_USERNAME et INPI_PASSWORD doivent être configurés dans .env.local. " +
        "Crée un compte sur https://data.inpi.fr puis renseigne tes identifiants."
    );
  }

  const r = await fetch(`${INPI_BASE}/sso/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new InpiError(
      `Auth INPI a échoué (${r.status}) : ${body.slice(0, 200)}`,
      r.status
    );
  }
  const json = (await r.json()) as { token?: string };
  if (!json.token) {
    throw new InpiError("Auth INPI : pas de token dans la réponse");
  }
  cachedToken = { token: json.token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return json.token;
}

/**
 * Schéma partiel de la réponse INPI pour les données qu'on consomme.
 * Le schéma complet est très riche, on n'expose que ce qui nous sert.
 *
 * `dateClotureExerciceSocial` peut se trouver a plusieurs endroits selon
 * le type d'entite (PM societe vs PP entrepreneur individuel).
 */
type InpiCompanyResponse = {
  formality?: {
    content?: {
      // Personne morale (societe SARL/SAS/etc.) - chemin principal
      personneMorale?: {
        identite?: {
          description?: {
            dateClotureExerciceSocial?: string;
          };
        };
      };
      // Personne physique (entrepreneur individuel) - chemin alternatif
      personnePhysique?: {
        identite?: {
          entrepreneur?: {
            descriptionPersonne?: {
              dateClotureExerciceSocial?: string;
            };
          };
          // Variante observee parfois
          description?: {
            dateClotureExerciceSocial?: string;
          };
        };
      };
      // Exploitation agricole - chemin alternatif
      exploitation?: {
        identite?: {
          description?: {
            dateClotureExerciceSocial?: string;
          };
        };
      };
    };
  };
};

export type InpiCompanyData = {
  /** Jour + mois de clôture de l'exercice (1..31 / 1..12) */
  cloture: { jour: number; mois: number } | null;
};

/**
 * Parse une string "JJMM" ou "MMJJ" en {jour, mois}.
 *
 * Le format documente officiellement par l'INPI est JJMM (ex. "3112" =
 * 31/12). En pratique, certaines reponses utilisent MMJJ (ex. "0630" =
 * 30/06). On teste donc les deux interpretations et on choisit celle qui
 * produit un couple jour/mois valide. Si les deux sont valides (cas
 * ambigu comme "0612" = 6/12 OU 12/6), on prefere JJMM par defaut.
 */
function parseDateCloture(
  dateRaw: string | null | undefined,
  siren: string
): { jour: number; mois: number } | null {
  if (!dateRaw || !/^\d{4}$/.test(dateRaw)) return null;
  const a = parseInt(dateRaw.slice(0, 2), 10);
  const b = parseInt(dateRaw.slice(2, 4), 10);
  const jjmmOk = a >= 1 && a <= 31 && b >= 1 && b <= 12;
  const mmjjOk = b >= 1 && b <= 31 && a >= 1 && a <= 12;
  if (jjmmOk && mmjjOk) {
    // Ambigu (ex. "0612") -> on garde JJMM (format documente)
    return { jour: a, mois: b };
  }
  if (jjmmOk) return { jour: a, mois: b };
  if (mmjjOk) {
    // eslint-disable-next-line no-console
    console.warn(
      `[INPI] SIREN ${siren} : dateClotureExerciceSocial au format MMJJ ("${dateRaw}") -> jour=${b} mois=${a}`
    );
    return { jour: b, mois: a };
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[INPI] SIREN ${siren} : dateClotureExerciceSocial invalide "${dateRaw}"`
  );
  return null;
}

/**
 * Récupère les données RNE d'une entreprise par son SIREN.
 * Retourne null si l'entreprise n'est pas trouvée côté INPI.
 */
export async function getInpiCompany(
  siren: string
): Promise<InpiCompanyData | null> {
  const token = await getToken();
  const r = await fetch(`${INPI_BASE}/companies/${siren}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new InpiError(
      `INPI a renvoyé ${r.status} pour SIREN ${siren} : ${body.slice(0, 200)}`,
      r.status
    );
  }
  const json = (await r.json()) as InpiCompanyResponse;
  const content = json.formality?.content;

  // On tente tous les chemins connus jusqu'a trouver une valeur.
  const dateRaw =
    content?.personneMorale?.identite?.description?.dateClotureExerciceSocial ??
    content?.personnePhysique?.identite?.entrepreneur?.descriptionPersonne
      ?.dateClotureExerciceSocial ??
    content?.personnePhysique?.identite?.description?.dateClotureExerciceSocial ??
    content?.exploitation?.identite?.description?.dateClotureExerciceSocial ??
    null;

  if (!dateRaw) {
    // eslint-disable-next-line no-console
    console.warn(
      `[INPI] SIREN ${siren} : pas de dateClotureExerciceSocial dans la reponse RNE`
    );
  }

  const cloture = parseDateCloture(dateRaw, siren);
  return { cloture };
}
