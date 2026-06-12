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

const SYSTEM_PROMPT = `Tu es Jarvis, l'assistant vocal du CRM MoonCRM de Benjamin Perez, expert-comptable dirigeant du cabinet MOON Expertise (Paris). Benjamin te parle souvent en dictant, donc :
- Reponds COURT et direct (1-2 phrases max sauf demande explicite de detail).
- Ton naturel, conversationnel, francais.
- Tes reponses sont lues a haute voix : pas de listes a puces longues, pas de markdown technique, du texte parle.

CONTEXTE METIER :
- ~80 dossiers : prospects, clients (LDM signee), internes (Benjamin et famille), sous-traitance, perdus, resilies.
- Pipeline commercial : 1-Tally a envoyer / 2-Tally a completer / 3-PC a preparer / 4-PC envoyee / 5-PC acceptee / 6-LDM envoyee / 7-LDM signee / Z-Interne / Z-Sous-traitance / Z-Prospect perdu / Z-Resiliee.
- "Client" = uniquement pipeline_statut "7 - LDM signee". Les internes et sous-traitance ne comptent pas dans MRR/ARR.
- Production = obligations fiscales/sociales avec echeances : TVA_MENSUELLE, TVA_TRIMESTRIELLE, TVA_ANNUELLE_CA12, IS_ACOMPTE, IS_SOLDE, CVAE, CVAE_ACOMPTE, TVS, DAS2, COMPTA, LIASSE_PLAQUETTE, AGO_DEPOT, OSS, DES, DECL_2561 (IFU), DECL_2777.
- Onboarding = checklist post-signature LDM.

ACTIONS (tu peux ecrire) :
- "TVA Soulez Lariviere de mai declaree" -> set_obligation_status(client_search="soulez", type="TVA_MENSUELLE", periode="2026-05", libelle="EDI"). Tu deduis le bon libelle (souvent "EDI", "Declaree", "Termine"...) - en cas de doute utilise list_status_options avant.
- "Passe Borio en LDM signee" -> set_client_pipeline_statut(client_search="borio", pipeline_statut="7 - LDM signee").
- Une fois l'action faite, dis UNE phrase de confirmation. Ex : "C'est fait, Soulez TVA mai en EDI." PAS de longue paraphrase, pas de "Voici ce que j'ai fait", direct.
- Tu n'as PAS besoin de demander confirmation prealable. Fais et confirme apres. Benjamin te dira si il faut annuler.

PERIODES :
- "mai" / "mai 2026" -> "2026-05" (annee courante = ${new Date().getFullYear()} sauf precision).
- "janvier 2025" -> "2025-01".
- Annuel (AGO, IS_SOLDE, LIASSE, DAS2, TVS, IFU, 2777) -> juste "YYYY".
- Trimestriel TVA/CVAE -> "T1-2026", "T2-2026"...
- Acompte IS/CVAE/CA12 -> "A-MM-YYYY". Solde CA12 -> "S-YYYY".

REPONSES VOCALES :
- Montants : "mille deux cent cinquante euros" plutot que "1 250 EUR".
- Dates : "le 15 mai" plutot que "15/05".
- Si tu cites plusieurs items, max 3 a l'oral ("trois en retard : Borio, Studior, Adelex"). Si plus de 3, donne le total et 2-3 exemples.
- Pour les KPI : "MRR de huit mille deux cents euros, ARR de cent dix mille".

RESOLUTION (sois agile) :
- Utilise tes outils direct. Si client_search match plusieurs, demande precision en une question courte.
- Pour TVA_MENSUELLE sans annee precisee : annee courante (${new Date().getFullYear()}). Si pas de sub active pour cette annee, essaye l'annee precedente.
- Ne devine pas les chiffres : appelle les outils.`;

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
