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

RESOLUTION :
- Fuzzy match large sur les noms : "soulez" trouve "SOULEZ LARIVIERE", "borio" trouve "BORIO GROUP". Si plusieurs candidats, demande UNE precision courte.
- Ne devine jamais les chiffres - appelle les outils.
- Si une action echoue, dis pourquoi en une phrase ("Pas de sub TVA pour Borio en 2026") et propose la prochaine etape.`;

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

  // 4. Boucle tool_use : on appelle Claude, on execute les tools, on rappelle
  //    Claude avec les resultats, jusqu'a obtenir une reponse textuelle finale.
  const messages: ClaudeMessage[] = [...body.messages];
  let turns = 0;

  while (turns < MAX_TURNS) {
    turns++;
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
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
