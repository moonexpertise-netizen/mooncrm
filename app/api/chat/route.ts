/**
 * POST /api/chat - Endpoint de l'assistant CRM MOON.
 *
 * Recoit la conversation (messages), appelle Claude avec les outils declares,
 * execute les tool_use dans une boucle jusqu'a obtenir une reponse textuelle,
 * et renvoie le texte final + la conversation complete (utile pour la
 * persistance cote client).
 *
 * Authentification : on lit la session Supabase via cookies. Si pas
 * d'utilisateur, 401. Sinon, la session est utilisee pour les requetes
 * d'outils (RLS respectee).
 *
 * IMPORTANT : la cle ANTHROPIC_API_KEY doit etre dans .env.local + Vercel.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from "./tools";
import { slugForType } from "@/app/obligations/trackers";

/** Format universel d'une mutation faite par l'IA (renvoye au client pour
 *  afficher un toast + deep link). */
type JarvisChange = {
  kind: "obligation_status" | "client_pipeline";
  /** Titre court : "Obligation mise a jour" / "Pipeline change" */
  title: string;
  /** Description courte : "Soulez Lariviere TVA mai -> EDI" */
  description: string;
  /** URL deep-link vers la cellule modifiee (focus client + annee) */
  href: string;
  /** Donnees brutes pour debug / tests */
  raw: Record<string, unknown>;
};

/** Extrait annee depuis periode (TVA "2026-05" -> 2026, AGO "2025" -> 2025). */
function anneeFromPeriode(periode: string): number | null {
  const m = String(periode).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/** Mois FR pour formater la description (TVA mai 2026, etc). */
const MOIS_FR = ["jan", "fev", "mar", "avr", "mai", "juin", "jui", "aou", "sep", "oct", "nov", "dec"];
function formatPeriodeShort(periode: string): string {
  // "2026-05" -> "mai 2026"
  const m1 = periode.match(/^(\d{4})-(\d{2})$/);
  if (m1) return `${MOIS_FR[parseInt(m1[2], 10) - 1]} ${m1[1]}`;
  // "T1-2026" -> "T1 2026"
  const m2 = periode.match(/^T(\d)-(\d{4})$/);
  if (m2) return `T${m2[1]} ${m2[2]}`;
  // "A-06-2026" -> "acpt juin 2026"
  const m3 = periode.match(/^A-(\d{2})-(\d{4})$/);
  if (m3) return `acpt ${MOIS_FR[parseInt(m3[1], 10) - 1]} ${m3[2]}`;
  // "S-2026" -> "solde 2026"
  const m4 = periode.match(/^S-(\d{4})$/);
  if (m4) return `solde ${m4[1]}`;
  // "2026" -> "2026"
  return periode;
}

/** Transforme un tool_result success en JarvisChange si c'est une mutation. */
function toolResultToChange(
  toolName: string,
  result: unknown
): JarvisChange | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (!r.ok) return null;

  if (toolName === "set_obligation_status") {
    const slug = String(r.client_slug ?? "");
    const type = String(r.type ?? "");
    const periode = String(r.periode ?? "");
    const libelle = String(r.libelle ?? "");
    const client = String(r.client ?? "");
    const annee = anneeFromPeriode(periode);
    const trackerSlug = slugForType(type);
    const href =
      trackerSlug && annee
        ? `/obligations/${trackerSlug}?year=${annee}&focus=${slug}`
        : `/clients/${slug}/obligations`;
    return {
      kind: "obligation_status",
      title: "Statut mis a jour",
      description: `${client} · ${type.replace(/_/g, " ").toLowerCase()} ${formatPeriodeShort(periode)} → ${libelle}`,
      href,
      raw: r,
    };
  }

  if (toolName === "set_client_pipeline_statut") {
    const slug = String(r.client_slug ?? "");
    const client = String(r.client ?? "");
    const pipeline = String(r.pipeline_statut ?? "");
    return {
      kind: "client_pipeline",
      title: "Pipeline mis a jour",
      description: `${client} → ${pipeline}`,
      href: `/clients/${slug}`,
      raw: r,
    };
  }

  return null;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TURNS = 8; // garde-fou anti-boucle infinie tool_use

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1; // 1-12

const SYSTEM_PROMPT = `Tu es l'assistant vocal de Benjamin Perez, expert-comptable dirigeant de MOON Expertise (Paris). Benjamin te parle a la voix - tes reponses sont lues a haute voix par une voix de synthese.

TON :
- Tu es un collegue de cabinet competent, pas un robot. Tu reponds comme un humain te repondrait : phrase normale, ponctuation naturelle, ton calme.
- Bref par defaut mais PAS telegraphique. Une vraie phrase, pas un mot tout seul.
- Pas de "C'est fait" robotique. Tu dis ce que tu viens de faire dans une phrase normale, comme un assistant qui rapporte.
- Pas de markdown, pas d'asterisques, pas de listes a puces - juste de la prose courte. Les ":" et virgules font des pauses naturelles a la lecture.
- Si Benjamin te tutoie, tu le tutoies. Si il te dit "STP" ou "merci", tu fluidifies sans commenter.

EXEMPLES DE TON :
- Bon : "Souelez Lariviere TVA mai, c'est passe en EDI."
- Mauvais : "Action effectuee. Le statut a ete mis a jour avec succes."
- Bon : "MRR a huit mille deux cents euros, ARR a cent dix mille. Tu as signe deux clients ce mois."
- Bon (ambiguite) : "J'ai deux Litvine dans le CRM, Sacha et Anna. Lequel ?"
- Bon (deja fait) : "C'etait deja en EDI."
- Bon (erreur) : "Pas trouve de souscription TVA mensuelle pour Borio en 2026. Tu veux qu'on regarde 2025 ?"

CONTEXTE METIER :
- ~80 dossiers : prospects, clients (LDM signee), internes (Benjamin et famille), sous-traitance, perdus, resilies.
- Pipeline commercial : 1-Tally a envoyer / 2-Tally a completer / 3-PC a preparer / 4-PC envoyee / 5-PC acceptee / 6-LDM envoyee / 7-LDM signee / Z-Interne / Z-Sous-traitance / Z-Prospect perdu / Z-Resiliee.
- "Client" = uniquement pipeline_statut "7 - LDM signee". Internes et sous-traitance ne comptent pas dans MRR/ARR.
- Production = obligations fiscales/sociales : TVA_MENSUELLE, TVA_TRIMESTRIELLE, TVA_ANNUELLE_CA12, IS_ACOMPTE, IS_SOLDE, CVAE, CVAE_ACOMPTE, TVS, DAS2, COMPTA, LIASSE_PLAQUETTE, AGO_DEPOT, OSS, DECL_2561 (IFU), DECL_2777.

ACTIONS - tu agis directement, sans demander confirmation :
- "TVA Soulez Lariviere de mai declaree" -> set_obligation_status(client_search="soulez", type="TVA_MENSUELLE", periode="${CURRENT_YEAR}-05", libelle="EDI"). Tu deduis le libelle metier qui colle au verbe. Si tu hesites, list_status_options pour voir les libelles dispo de ce type.
- "Passe Borio en LDM signee" -> set_client_pipeline_statut(client_search="borio", pipeline_statut="7 - LDM signee").
- Fais l'action puis confirme. Tu n'as PAS a demander avant.

PERIODES :
- Annee courante = ${CURRENT_YEAR}, mois courant = ${CURRENT_MONTH}.
- "mai" sans annee -> "${CURRENT_YEAR}-05" (annee courante).
- TVA mensuelle "mai 2025" -> "2025-05". TVA trimestrielle "T1 2026" -> "T1-2026".
- Annuel (AGO, IS_SOLDE, LIASSE, DAS2, TVS, IFU, 2777) : juste "${CURRENT_YEAR}" ou l'annee precisee.
- Acompte IS/CVAE/CA12 "acompte juin 2026" -> "A-06-2026". Solde CA12 -> "S-2026".

VOCABULAIRE METIER (deduis vite le bon libelle) :
- "declaree", "envoyee", "deposee", "passee" sur TVA -> "EDI" (le libelle TERMINE TVA).
- "faite", "terminee", "OK", "validee" -> trouve le libelle TERMINE du type via list_status_options.
- "en cours", "demarree", "lancee" -> libelle EN_COURS.
- "signee" sur AGO -> le libelle "Signee" (EN_COURS), pas TERMINE. "Deposee" -> TERMINE.

LECTURE VOCALE (la voix lit ta reponse) :
- Montants en chiffres, c'est OK : "huit mille deux cents euros" et "8200 euros" sont OK, la voix lit les deux.
- Dates : "le quinze mai" est mieux que "15/05".
- Pas plus de 3 items cites a l'oral. Au-dela, donne le total et 2-3 exemples.

TRANSCRIPTION VOCALE FOIREUSE - tres important :
- Benjamin dicte. La reconnaissance vocale du browser merde sur les
  acronymes et les noms propres. Tu ne dois JAMAIS dire "je ne trouve
  pas" sans avoir essaye un fuzzy match agressif.
- Mots techniques fréquemment massacrés :
  * "EDI" entendu "petit", "et", "et dit", "et y", "edith", "eddy"
  * "Terminé" entendu "déterminé", "et terminé"
  * "AGO" entendu "à gauche", "à go", "ago"
  * "IS" entendu "il", "il y a", "yes"
  * "TVA" entendu "ta vé a", "tva"
  * "CAA" entendu "caca", "ka a a"
  * "DAS2" entendu "des deux", "ad as deux"
  * "CFE" entendu "cef e", "se feu"
- Noms clients souvent decoupes : "Soulez Lariviere" entendu "soulé
  larivière", "soulez". Match toujours sur les substrings.
- Si tu hesites entre 2 interpretations, va sur la plus probable et
  agis. Tu peux dire "j'ai compris X, c'etait bien ca ?" APRES l'action.
- Si ton 1er tool call echoue, retente avec une autre interpretation
  AVANT de demander une precision.

RESOLUTION :
- Fuzzy match large sur les noms : "soulez" trouve "SOULEZ LARIVIERE",
  "borio" trouve "BORIO GROUP". La liste complete des clients t'est
  injectee dans le contexte ci-dessous - utilise-la pour matcher meme
  les transcriptions partielles.
- La liste des libelles de statut par type t'est aussi injectee -
  matche dessus. Pas besoin de list_status_options si la donnee est
  deja la.
- Si plusieurs candidats apres fuzzy match, prends le plus court / le
  plus proche phonetiquement.
- Si une action echoue, dis pourquoi en une phrase et propose la
  prochaine etape sans demander.`;

type ClaudeMessage = Anthropic.MessageParam;

export async function POST(req: Request) {
  // 1. Auth Supabase
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return Response.json({ error: "Non authentifie" }, { status: 401 });
  }

  // 2. Cle API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Variable ANTHROPIC_API_KEY manquante. Ajoute-la dans .env.local (dev) et dans les variables d'environnement Vercel (prod).",
      },
      { status: 500 }
    );
  }

  // 3. Parse body
  let body: { messages: ClaudeMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON invalide" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Champ messages manquant ou vide" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  // 3.5. Pre-charge le contexte CRM : roster client + libelles statuts.
  //      Tres important pour la dictee vocale : sans ces donnees l'IA appelle
  //      les outils en aveugle et galere a deviner quel client est cite,
  //      quel libelle exact appliquer (surtout avec une transcription qui
  //      glisse - "petit" pour "EDI", etc).
  //      Couts : ~80 clients + ~50 status_options = ~3-5k tokens.
  //      Cache prompt 5min cote Anthropic pour amortir entre messages.
  const [{ data: clientsList }, { data: statusOptsList }] = await Promise.all([
    sb
      .from("clients")
      .select("denomination, slug, siren, pipeline_statut")
      .order("denomination"),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, ordre")
      .eq("scope", "obligation")
      .eq("actif", true)
      .order("type_code")
      .order("ordre"),
  ]);

  let crmContext = "";
  if (clientsList && clientsList.length > 0) {
    const lines = clientsList.map((c) => {
      const ds = c.pipeline_statut ? ` [${c.pipeline_statut}]` : "";
      const siren = c.siren ? ` (SIREN ${c.siren})` : "";
      return `- ${c.denomination}${siren}${ds} -> slug: ${c.slug}`;
    });
    crmContext += `\n\n=== CLIENTS DANS LE CRM (${clientsList.length}) ===\n` + lines.join("\n");
  }
  if (statusOptsList && statusOptsList.length > 0) {
    // Groupe par type pour lisibilite
    const byType = new Map<string, Array<{ libelle: string; statut_logique: string }>>();
    for (const o of statusOptsList) {
      const key = o.type_code as string;
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key)!.push({
        libelle: o.libelle as string,
        statut_logique: o.statut_logique as string,
      });
    }
    const parts: string[] = [];
    for (const [type, opts] of byType) {
      parts.push(
        `${type} : ${opts.map((o) => `"${o.libelle}" (${o.statut_logique})`).join(", ")}`
      );
    }
    crmContext +=
      `\n\n=== LIBELLES STATUT PAR TYPE D'OBLIGATION ===\n` + parts.join("\n");
  }
  const fullSystemPrompt = SYSTEM_PROMPT + crmContext;

  // 4. Boucle tool_use : on appelle Claude, on execute les tools, on rappelle
  //    Claude avec les resultats, jusqu'a obtenir une reponse textuelle finale.
  const messages: ClaudeMessage[] = [...body.messages];
  let turns = 0;
  // Accumule les mutations (writes) effectuees dans cette conversation
  // pour les renvoyer au client (toast + deep link).
  const changes: JarvisChange[] = [];

  while (turns < MAX_TURNS) {
    turns++;
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        // System en array avec cache_control : Anthropic cache le bloc 5min,
        // les requetes suivantes ne paient pas a nouveau les 3-5k tokens
        // du roster client + status_options.
        system: [
          {
            type: "text",
            text: fullSystemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOL_DEFINITIONS,
        messages,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[/api/chat] Erreur appel Claude :", msg);
      return Response.json({ error: `Erreur Claude API : ${msg}` }, { status: 500 });
    }

    // Si Claude a fini (texte uniquement, pas de tool_use), on extrait et on return.
    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return Response.json({
        text,
        messages: [...messages, { role: "assistant", content: response.content }],
        turns,
        changes,
      });
    }

    // Sinon : Claude demande d'executer un ou plusieurs outils
    const toolUses = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use"
    );

    // Execute en parallele
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (tu) => {
        const handler = TOOL_HANDLERS[tu.name];
        if (!handler) {
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ error: `Outil inconnu : ${tu.name}` }),
            is_error: true,
          };
        }
        try {
          const result = await handler(tu.input as Record<string, unknown>, sb);
          // Capture les mutations reussies pour les renvoyer au client
          const change = toolResultToChange(tu.name, result);
          if (change) changes.push(change);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // eslint-disable-next-line no-console
          console.error(`[/api/chat] Outil ${tu.name} a echoue :`, msg);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ error: msg }),
            is_error: true,
          };
        }
      })
    );

    // Append assistant response + tool results, puis recommence
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // Si on sort de la boucle sans reponse texte, c'est qu'on a tape MAX_TURNS
  return Response.json(
    { error: `Boucle tool_use trop longue (${MAX_TURNS} tours).` },
    { status: 500 }
  );
}
