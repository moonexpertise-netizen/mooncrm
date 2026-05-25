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
 */
type InpiCompanyResponse = {
  formality?: {
    content?: {
      personneMorale?: {
        identite?: {
          description?: {
            dateClotureExerciceSocial?: string; // format "JJMM", ex. "3112"
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

  // Date de clôture au format "JJMM" (4 chiffres collés, ex. "3112" = 31/12)
  const dateRaw =
    json.formality?.content?.personneMorale?.identite?.description
      ?.dateClotureExerciceSocial ?? null;
  let cloture: { jour: number; mois: number } | null = null;
  if (dateRaw && /^\d{4}$/.test(dateRaw)) {
    const jour = parseInt(dateRaw.slice(0, 2), 10);
    const mois = parseInt(dateRaw.slice(2, 4), 10);
    if (jour >= 1 && jour <= 31 && mois >= 1 && mois <= 12) {
      cloture = { jour, mois };
    }
  }

  return { cloture };
}
