/**
 * Conversion DOCX → PDF via conv2pdf.
 * Documentation : https://www.conv2pdf.com/api/
 *
 * Remplace ConvertAPI (token révoqué, 401 sur tous les modes d'auth).
 *
 * Mise en route :
 *   1. Compte sur https://www.conv2pdf.com/login/ (lien magique par email)
 *   2. Copier la clé du tableau de bord (préfixe `cpdf_live_`)
 *   3. .env.local  ->  CONV2PDF_TOKEN=cpdf_live_...
 *   4. Idem dans les variables d'environnement Vercel pour la production.
 *
 * Quota gratuit : 300 conversions/mois. Les documents transitent par un tiers
 * (DPA disponible sur demande — à réclamer vu le secret professionnel).
 *
 * L'API est ASYNCHRONE : la conversion renvoie un lien de téléchargement,
 * éventuellement après une phase de traitement, d'où la boucle d'attente.
 */

const BASE = "https://api.conv2pdf.com/v1";
const OUTIL = "word-to-pdf";

/** Attente maximale d'un job de conversion, et pas entre deux vérifications. */
const ATTENTE_MAX_MS = 60_000;
const PAS_MS = 1_000;

export class DocxToPdfError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "DocxToPdfError";
  }
}

function token(): string {
  const t = process.env.CONV2PDF_TOKEN;
  if (!t) {
    throw new DocxToPdfError(
      "CONV2PDF_TOKEN non configuré. Crée un compte sur " +
        "https://www.conv2pdf.com/login/ puis copie ta clé (cpdf_live_…) " +
        "dans .env.local : CONV2PDF_TOKEN=cpdf_live_…"
    );
  }
  return t;
}

/** Réponse de conversion : le nommage exact varie, on accepte les variantes. */
type ReponseConversion = {
  download_url?: string;
  downloadUrl?: string;
  jobId?: string;
  job_id?: string;
  id?: string;
  status?: string;
  error?: string;
  message?: string;
};

function lienTelechargement(r: ReponseConversion): string | null {
  const direct = r.download_url ?? r.downloadUrl;
  if (direct) return direct.startsWith("http") ? direct : `${BASE}${direct}`;
  const job = r.jobId ?? r.job_id ?? r.id;
  return job ? `${BASE}/download/${job}` : null;
}

const dors = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Convertit un buffer DOCX en buffer PDF.
 * Signature inchangée depuis la version ConvertAPI : les appelants
 * (routes /ldm et /ldm-pdf) n'ont rien à modifier.
 */
export async function docxToPdf(
  docxBuffer: Buffer,
  filename = "document.docx"
): Promise<Buffer> {
  const cle = token();

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(docxBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    filename
  );

  const r = await fetch(`${BASE}/convert/${OUTIL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}` },
    body: form,
  });

  if (!r.ok) {
    const corps = await r.text().catch(() => "");
    throw new DocxToPdfError(
      r.status === 401
        ? "Clé conv2pdf refusée (401). Vérifie CONV2PDF_TOKEN dans .env.local et sur Vercel."
        : `conv2pdf a renvoyé ${r.status} : ${corps.slice(0, 300)}`,
      r.status
    );
  }

  // Certaines réponses renvoient directement le PDF binaire plutôt qu'un JSON.
  const typeReponse = r.headers.get("content-type") ?? "";
  if (typeReponse.includes("application/pdf")) {
    return Buffer.from(await r.arrayBuffer());
  }

  const json = (await r.json().catch(() => null)) as ReponseConversion | null;
  if (!json) {
    throw new DocxToPdfError("Réponse conv2pdf illisible (ni PDF, ni JSON).");
  }
  if (json.error) {
    throw new DocxToPdfError(`conv2pdf : ${json.error} ${json.message ?? ""}`.trim());
  }

  const url = lienTelechargement(json);
  if (!url) {
    throw new DocxToPdfError(
      `Réponse conv2pdf sans lien de téléchargement : ${JSON.stringify(json).slice(0, 300)}`
    );
  }

  // Le job peut être encore en traitement : on réessaie jusqu'à obtenir le PDF.
  const limite = Date.now() + ATTENTE_MAX_MS;
  let dernierStatut = "";
  while (Date.now() < limite) {
    const d = await fetch(url, { headers: { Authorization: `Bearer ${cle}` } });

    if (d.ok) {
      const type = d.headers.get("content-type") ?? "";
      if (type.includes("application/pdf") || type.includes("octet-stream")) {
        return Buffer.from(await d.arrayBuffer());
      }
      // JSON = job pas encore prêt (ou en erreur).
      const suivi = (await d.json().catch(() => null)) as ReponseConversion | null;
      dernierStatut = suivi?.status ?? "";
      if (suivi?.error) {
        throw new DocxToPdfError(`conv2pdf : conversion échouée (${suivi.error}).`);
      }
    } else if (d.status !== 404 && d.status !== 202) {
      // 404/202 = pas encore disponible, on patiente. Le reste est une vraie erreur.
      const corps = await d.text().catch(() => "");
      throw new DocxToPdfError(
        `Téléchargement conv2pdf : ${d.status} ${corps.slice(0, 200)}`,
        d.status
      );
    }

    await dors(PAS_MS);
  }

  throw new DocxToPdfError(
    `Conversion conv2pdf non aboutie après ${ATTENTE_MAX_MS / 1000} s` +
      (dernierStatut ? ` (dernier statut : ${dernierStatut}).` : ".")
  );
}
