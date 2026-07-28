import "server-only";

/**
 * Assemblage de fichiers .eml (RFC 5322) ouvrables dans Outlook.
 *
 * POURQUOI un .eml plutôt qu'un lien mailto: — un mailto passe par l'URL, donc
 * Outlook tronque le corps au-delà d'environ 2000 caractères et n'accepte que
 * du texte brut. Le .eml n'a aucune de ces limites.
 *
 * L'en-tête `X-Unsent: 1` est LA clé : sans lui Outlook ouvre le fichier comme
 * un message reçu (lecture seule) ; avec lui, il l'ouvre comme un brouillon
 * modifiable, prêt à partir. Pas d'en-tête `From` volontairement : Outlook
 * utilise alors le compte par défaut de l'utilisateur.
 *
 * Corps envoyé en multipart/alternative (texte brut + HTML) : le texte brut
 * garantit la lisibilité partout, la partie HTML donne à Outlook un rendu
 * correct des paragraphes en mode composition.
 */

const CRLF = "\r\n";

/** Encodage RFC 2047 des en-têtes non-ASCII (accents dans l'objet). */
function encodeHeader(valeur: string): string {
  const propre = valeur.replace(/[\r\n]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(propre)) return propre;
  return `=?UTF-8?B?${Buffer.from(propre, "utf8").toString("base64")}?=`;
}

/** Base64 replié à 76 colonnes, comme l'exige la RFC pour un corps de message. */
function base64Plie(texte: string): string {
  const b64 = Buffer.from(texte, "utf8").toString("base64");
  return (b64.match(/.{1,76}/g) ?? []).join(CRLF);
}

function echappeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Une ligne de puce : « - texte », « • texte » ou « * texte ». */
const PUCE = /^\s*[-•*]\s+(.*)$/;

/**
 * Police et couleur du corps, répétées sur CHAQUE élément de texte.
 *
 * Un style porté par <body> seul ne suffit pas : à l'ouverture d'un brouillon,
 * Outlook renormalise le HTML et retombe sur la couleur par défaut de son
 * éditeur (un gris foncé, pas du noir). La couleur doit donc être inline sur
 * les <p> et les <li> pour survivre.
 */
const STYLE_TEXTE = "font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000";

/**
 * Texte brut -> HTML : lignes vides = nouveau paragraphe, sauts simples = <br>.
 * Un paragraphe entièrement composé de puces devient une vraie liste <ul> :
 * les modèles qui énumèrent des pièces à fournir sortent proprement dans
 * Outlook au lieu d'une suite de tirets.
 */
function texteVersHtml(corps: string): string {
  const paragraphes = corps
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => {
      const lignes = p.split("\n").filter((l) => l.trim());
      const puces = lignes.map((l) => l.match(PUCE)).filter(Boolean);
      if (lignes.length > 0 && puces.length === lignes.length) {
        const items = puces
          .map((m) => `<li style="${STYLE_TEXTE};margin:0 0 4px 0">${echappeHtml(m![1])}</li>`)
          .join("");
        return `<ul style="${STYLE_TEXTE};margin:0 0 12px 0;padding-left:22px">${items}</ul>`;
      }
      return `<p style="${STYLE_TEXTE};margin:0 0 12px 0">${echappeHtml(p).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return `<html><body style="${STYLE_TEXTE}"><div style="${STYLE_TEXTE}">${paragraphes}</div></body></html>`;
}

export type PieceJointe = {
  /** Nom affiché dans Outlook ; les accents sont encodés à l'écriture. */
  nom: string;
  contenu: Buffer;
  /** Type MIME ; par défaut binaire générique. */
  type?: string;
};

export type EmlInput = {
  /** Destinataire principal ; peut être vide (Outlook ouvrira le champ vierge). */
  to: string;
  cc?: string;
  subject: string;
  /** Corps en TEXTE BRUT (les modèles sont édités en texte simple). */
  body: string;
  /** Fichiers joints au brouillon (le courrier signé, typiquement). */
  pieces?: PieceJointe[];
  /** Date du brouillon ; injectable pour les tests. */
  date?: Date;
};

/** Base64 d'un binaire, replié à 76 colonnes. */
function base64Binaire(buf: Buffer): string {
  const b64 = buf.toString("base64");
  return (b64.match(/.{1,76}/g) ?? []).join(CRLF);
}

/** Les deux représentations du corps, dans une frontière alternative. */
function partiesCorps(frontiere: string, body: string): string[] {
  const corpsTexte = body.replace(/\r\n/g, "\n").replace(/\n/g, CRLF);
  return [
    `--${frontiere}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Plie(corpsTexte),
    "",
    `--${frontiere}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Plie(texteVersHtml(body)),
    "",
    `--${frontiere}--`,
  ];
}

/**
 * Construit le contenu d'un fichier .eml prêt à être téléchargé.
 *
 * Sans pièce jointe : multipart/alternative (texte + HTML).
 * Avec : multipart/mixed englobant l'alternative puis chaque fichier — c'est
 * la structure qu'attend Outlook pour afficher les pièces jointes d'un
 * brouillon.
 */
export function buildEml({
  to,
  cc,
  subject,
  body,
  pieces = [],
  date = new Date(),
}: EmlInput): Buffer {
  const alt = `----=_MoonCRM_alt_${crypto.randomUUID()}`;

  const entetesCommuns = [
    `Date: ${date.toUTCString()}`,
    `To: ${encodeHeader(to)}`,
    ...(cc ? [`Cc: ${encodeHeader(cc)}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
  ];

  if (pieces.length === 0) {
    const lignes = [
      ...entetesCommuns,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      ...partiesCorps(alt, body),
      "",
    ];
    return Buffer.from(lignes.join(CRLF), "utf8");
  }

  const mixed = `----=_MoonCRM_mix_${crypto.randomUUID()}`;
  const lignes = [
    ...entetesCommuns,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    ...partiesCorps(alt, body),
    "",
  ];

  for (const p of pieces) {
    const nom = encodeHeader(p.nom);
    lignes.push(
      `--${mixed}`,
      `Content-Type: ${p.type ?? "application/octet-stream"}; name="${nom}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${nom}"`,
      "",
      base64Binaire(p.contenu),
      ""
    );
  }

  lignes.push(`--${mixed}--`, "");
  return Buffer.from(lignes.join(CRLF), "utf8");
}

/** En-tête Content-Disposition avec nom de fichier accentué (RFC 5987). */
export function dispositionPieceJointe(nomFichier: string): string {
  return `attachment; filename="${nomFichier}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`;
}
