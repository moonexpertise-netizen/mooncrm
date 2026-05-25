/**
 * Conversion DOCX → PDF via ConvertAPI.
 * Documentation : https://www.convertapi.com/docx-to-pdf
 *
 * Free tier : 1500 conversions/mois sans carte bancaire.
 * Inscription : https://www.convertapi.com/a/signup → récupérer le `Production
 * Token` dans le Dashboard → coller dans `.env.local` :
 *
 *   CONVERTAPI_TOKEN=ton_token_production
 *
 * (Le Sandbox Token sert uniquement au test bac à sable, ne pas l'utiliser ici.)
 */

export class DocxToPdfError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "DocxToPdfError";
  }
}

/**
 * Convertit un buffer DOCX en buffer PDF via ConvertAPI.
 * Utilise l'endpoint JSON (base64 inline) avec authentification Bearer Token.
 */
export async function docxToPdf(
  docxBuffer: Buffer,
  filename = "ldm.docx"
): Promise<Buffer> {
  // Compat : on accepte CONVERTAPI_TOKEN (nouveau) ou CONVERTAPI_SECRET (legacy)
  const token = process.env.CONVERTAPI_TOKEN || process.env.CONVERTAPI_SECRET;
  if (!token) {
    throw new DocxToPdfError(
      "CONVERTAPI_TOKEN non configuré dans .env.local. " +
        "Crée un compte sur https://www.convertapi.com/a/signup puis " +
        "copie ton Production Token dans .env.local : CONVERTAPI_TOKEN=ton_token"
    );
  }

  const r = await fetch("https://v2.convertapi.com/convert/docx/to/pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      Parameters: [
        {
          Name: "File",
          FileValue: {
            Name: filename,
            Data: docxBuffer.toString("base64"),
          },
        },
      ],
    }),
  });

  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new DocxToPdfError(
      `ConvertAPI a renvoyé ${r.status} : ${errBody.slice(0, 300)}`,
      r.status
    );
  }

  const json = (await r.json()) as {
    ConversionCost?: number;
    Files?: Array<{ FileName: string; FileExt: string; FileData: string }>;
  };

  const pdfBase64 = json.Files?.[0]?.FileData;
  if (!pdfBase64) {
    throw new DocxToPdfError(
      "Réponse ConvertAPI invalide : pas de fichier PDF retourné."
    );
  }

  return Buffer.from(pdfBase64, "base64");
}
