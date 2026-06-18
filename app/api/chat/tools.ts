/**
 * Outils (tools) exposes a Claude pour l'assistant CRM.
 *
 * Chaque outil :
 *   - declare son schema JSON (input)
 *   - implemente execute() qui interroge Supabase
 *
 * Outils de lecture + ecriture. L'utilisateur peut maintenant demander
 * a l'IA "TVA Soulez Lariviere de mai, declaree" -> appelle
 * set_obligation_status qui resout client + type + periode + libelle.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isClientBillable } from "@/lib/billable";

export type ToolResult = string | object;

type ToolHandler = (
  input: Record<string, unknown>,
  sb: SupabaseClient
) => Promise<ToolResult>;

/** Schemas declares a Claude. Cf. https://docs.anthropic.com/en/docs/build-with-claude/tool-use */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_clients",
    description:
      "Liste les clients du CRM avec filtres optionnels. Utilise quand l'utilisateur demande 'mes clients', 'mes prospects', 'qui a signe', etc. Retourne max 50 lignes.",
    input_schema: {
      type: "object",
      properties: {
        pipeline_statut: {
          type: "string",
          description:
            "Filtre exact sur le pipeline_statut. Valeurs : '1 - Tally a envoyer', '2 - Tally a completer', '3 - PC a preparer', '4 - PC envoyee', '5 - PC acceptee', '6 - LDM envoyee', '7 - LDM signee', 'Z - Interne', 'Z - Sous-traitance', 'Z - Perdu dans l\\'espace', 'Z - Prospect perdu', 'Z - Resiliee'.",
        },
        bucket: {
          type: "string",
          enum: ["prospects", "clients", "internes_st", "perdus"],
          description:
            "Filtre groupe metier. 'clients' = LDM signee uniquement. 'prospects' = 1 a 6. 'internes_st' = Interne + Sous-traitance. 'perdus' = Perdu + Resiliee.",
        },
        search: {
          type: "string",
          description: "Recherche par denomination ou SIREN (substring case-insensitive).",
        },
      },
    },
  },
  {
    name: "get_client_details",
    description:
      "Recupere les details complets d'un client par son slug (ex. 'sacha-litvine') ou sa denomination. Inclut MRR, ARR, honoraires, dates, dirigeant, etc.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Slug du client (ex. 'adelex-consulting')" },
        denomination: {
          type: "string",
          description: "Nom du client (recherche fuzzy). Utilise si tu n'as pas le slug.",
        },
      },
    },
  },
  {
    name: "get_business_stats",
    description:
      "Statistiques business globales du cabinet : nombre de clients signes, MRR, ARR, panier moyen, signatures du mois courant, ARR signe ce mois. Utilise quand l'utilisateur demande 'combien je gagne', 'mon MRR', 'mes stats', etc. PAS de filtres : c'est un snapshot global.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_obligations_due",
    description:
      "Liste les obligations a echeance dans les N prochains jours (ou en retard si only_overdue=true). Utilise quand l'utilisateur demande 'quoi cette semaine', 'mes echeances', 'qu'est-ce qui est en retard'. Retourne max 50 lignes triees par echeance.",
    input_schema: {
      type: "object",
      properties: {
        within_days: {
          type: "number",
          description:
            "Fenetre en jours a partir d'aujourd'hui (1-90). Defaut: 7. Ignore si only_overdue=true.",
        },
        only_overdue: {
          type: "boolean",
          description: "Si true, retourne uniquement les obligations en retard (echeance < aujourd'hui ET non terminees).",
        },
        type: {
          type: "string",
          description:
            "Filtre type d'obligation (TVA_MENSUELLE, TVA_TRIMESTRIELLE, IS_ACOMPTE, IS_SOLDE, CFE, DAS2, COMPTA, LIASSE_PLAQUETTE, AGO_DEPOT, etc.). Optionnel.",
        },
      },
    },
  },
  {
    name: "get_onboarding_progress",
    description:
      "Progression des taches d'onboarding. Sans parametre : liste tous les clients avec leur pct d'avancement. Avec slug : detail des taches d'un client.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Slug d'un client specifique. Si omis, vue globale tri par pct croissant.",
        },
      },
    },
  },
  {
    name: "list_status_options",
    description:
      "Liste les libelles de statut disponibles pour un type d'obligation. Utilise AVANT set_obligation_status pour trouver le libelle exact (ex. 'EDI' / 'Pas commence' / 'Declaree') correspondant a la demande utilisateur. Retourne libelle + statut_logique (A_FAIRE / EN_COURS / TERMINE / NON_APPLICABLE).",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Type d'obligation (TVA_MENSUELLE, IS_ACOMPTE, AGO_DEPOT, LIASSE_PLAQUETTE, etc.).",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "set_obligation_status",
    description:
      "Passe une obligation au statut donne (ex. TVA Soulez Lariviere de mai en 'EDI'). Resout le client par nom (fuzzy), trouve la sub active pour (client, type, annee), cree la ligne obligation si elle n'existe pas encore (statut A_FAIRE par defaut), puis applique le libelle voulu. Pour TVA mensuelle, periode = 'YYYY-MM' (ex. '2026-05'). Pour les annuels (AGO, IS_SOLDE, LIASSE, DAS2, TVS, IFU), periode = 'YYYY'. Pour les trimestriels TVA/CVAE, periode = 'TQ-YYYY'. Pour acomptes IS/CVAE/CA12, periode = 'A-MM-YYYY' ou 'S-YYYY' (solde CA12).",
    input_schema: {
      type: "object",
      properties: {
        client_search: {
          type: "string",
          description:
            "Nom ou debut de nom du client (ex. 'soulez', 'studi'or'). Fuzzy match insensible a la casse. Si plusieurs matchs, l'outil renvoie une erreur avec la liste des candidats.",
        },
        type: {
          type: "string",
          description: "Type d'obligation (TVA_MENSUELLE, IS_ACOMPTE, AGO_DEPOT, LIASSE_PLAQUETTE, etc.).",
        },
        periode: {
          type: "string",
          description:
            "Periode exacte au format attendu par le type (cf. description outil). Si l'utilisateur a dit 'mai' sans annee, choisis l'annee la plus probable (souvent l'annee courante ou la sub la plus recente).",
        },
        libelle: {
          type: "string",
          description:
            "Libelle de statut a appliquer (doit exister dans status_options pour ce type). Verifie avec list_status_options si tu n'es pas sur.",
        },
      },
      required: ["client_search", "type", "periode", "libelle"],
    },
  },
  {
    name: "set_client_pipeline_statut",
    description:
      "Change le statut pipeline commercial d'un client (ex. 'passe Soulez en LDM signee'). Resout le client par nom (fuzzy) puis applique le pipeline_statut.",
    input_schema: {
      type: "object",
      properties: {
        client_search: {
          type: "string",
          description: "Nom ou debut de nom du client (fuzzy match insensible casse).",
        },
        pipeline_statut: {
          type: "string",
          description:
            "Valeur cible exacte parmi : '1 - Rencontre prospect', '2 - PC à préparer', '3 - PC envoyée', '4 - PC acceptée', '5 - Guide + Tally envoyé', '6 - LDM à préparer', '7 - LDM envoyée', '8 - LDM signée', 'Z - Interne', 'Z - Sous-traitance', 'Z - Perdu dans l\\'espace', 'Z - Prospect perdu', 'Z - Résiliée'.",
        },
      },
      required: ["client_search", "pipeline_statut"],
    },
  },
];

// ============================================================================
//  Helpers internes
// ============================================================================

/** Resout un client par fuzzy match sur denomination. Renvoie ambiguity si plusieurs. */
async function resolveClient(
  sb: SupabaseClient,
  search: string
): Promise<
  | { ok: true; id: string; slug: string; denomination: string }
  | { ok: false; reason: string }
> {
  const s = search.trim();
  if (!s) return { ok: false, reason: "Recherche client vide." };
  // Match large : ILIKE %s% sur denomination + slug
  const { data, error } = await sb
    .from("clients")
    .select("id, slug, denomination")
    .or(`denomination.ilike.%${s}%,slug.ilike.%${s}%`)
    .order("denomination")
    .limit(10);
  if (error) return { ok: false, reason: error.message };
  const rows = data ?? [];
  if (rows.length === 0) {
    return { ok: false, reason: `Aucun client trouve pour "${search}".` };
  }
  if (rows.length === 1) {
    return { ok: true, id: rows[0].id, slug: rows[0].slug, denomination: rows[0].denomination };
  }
  // Si match exact (case-insensitive) ou prefix, prefere-le
  const lower = s.toLowerCase();
  const exact = rows.find((r) => r.denomination.toLowerCase() === lower);
  if (exact) return { ok: true, ...exact };
  const prefix = rows.find((r) => r.denomination.toLowerCase().startsWith(lower));
  if (prefix) return { ok: true, ...prefix };
  return {
    ok: false,
    reason: `Plusieurs clients matchent "${search}" : ${rows.map((r) => r.denomination).join(", ")}. Sois plus precis.`,
  };
}

/** Extrait l'annee d'une periode au format attendu par les trackers. */
function anneeFromPeriode(periode: string): number | null {
  // "2026-05" / "T1-2026" / "A-06-2026" / "S-2026" / "2026"
  const m = periode.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/** Implementations cote serveur des outils. */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_clients: async (input, sb) => {
    let q = sb
      .from("clients")
      .select("slug, denomination, siren, forme, activite, pipeline_statut, origine, mrr, arr, mois_signature")
      .order("denomination")
      .limit(50);

    if (typeof input.pipeline_statut === "string") {
      q = q.eq("pipeline_statut", input.pipeline_statut);
    }
    if (typeof input.bucket === "string") {
      const BUCKETS: Record<string, string[]> = {
        prospects: ["1 - Rencontre prospect", "2 - PC à préparer", "3 - PC envoyée", "4 - PC acceptée", "5 - Guide + Tally envoyé", "6 - LDM à préparer", "7 - LDM envoyée", "Z - Perdu dans l'espace"],
        clients: ["8 - LDM signée"],
        internes_st: ["Z - Interne", "Z - Sous-traitance"],
        perdus: ["Z - Prospect perdu", "Z - Résiliée"],
      };
      const list = BUCKETS[input.bucket as string];
      if (list) q = q.in("pipeline_statut", list);
    }
    if (typeof input.search === "string" && input.search.trim()) {
      const s = input.search.trim();
      q = q.or(`denomination.ilike.%${s}%,siren.ilike.%${s}%`);
    }

    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      count: data?.length ?? 0,
      clients: data ?? [],
    };
  },

  get_client_details: async (input, sb) => {
    let row;
    if (typeof input.slug === "string") {
      const { data } = await sb
        .from("clients")
        .select("*, groupes(nom)")
        .eq("slug", input.slug)
        .maybeSingle();
      row = data;
    } else if (typeof input.denomination === "string") {
      const { data } = await sb
        .from("clients")
        .select("*, groupes(nom)")
        .ilike("denomination", `%${input.denomination}%`)
        .limit(1)
        .maybeSingle();
      row = data;
    }
    if (!row) return { error: "Client non trouve" };
    return row;
  },

  get_business_stats: async (_input, sb) => {
    // Coherent avec dashboard-data.ts : "client" = LDM signee uniquement
    const { data: clients } = await sb
      .from("clients")
      .select("pipeline_statut, mrr, arr, mois_signature");
    const signed = (clients ?? []).filter((c) => c.pipeline_statut === "8 - LDM signée");
    const mrr = signed.reduce((s, c) => s + (c.mrr ?? 0), 0);
    const arr = signed.reduce((s, c) => s + (c.arr ?? 0), 0);
    const startMonth = new Date();
    startMonth.setDate(1);
    const startMonthIso = startMonth.toISOString().substring(0, 10);
    const signedThisMonth = signed.filter(
      (c) => c.mois_signature && c.mois_signature >= startMonthIso
    );
    return {
      nb_clients_signes: signed.length,
      mrr_total: Math.round(mrr),
      arr_total: Math.round(arr),
      panier_moyen_arr: signed.length > 0 ? Math.round(arr / signed.length) : 0,
      signatures_ce_mois: signedThisMonth.length,
      arr_signe_ce_mois: Math.round(signedThisMonth.reduce((s, c) => s + (c.arr ?? 0), 0)),
    };
  },

  list_obligations_due: async (input, sb) => {
    const today = new Date().toISOString().substring(0, 10);
    const within = Math.min(90, Math.max(1, Number(input.within_days) || 7));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + within);
    const cutoffIso = cutoff.toISOString().substring(0, 10);
    const onlyOverdue = input.only_overdue === true;

    let q = sb
      .from("obligations")
      .select(
        "type, statut_logique, statut_detail, echeance, obligation_subscriptions!inner(actif), clients!inner(slug, denomination, pipeline_statut, origine)"
      )
      .eq("obligation_subscriptions.actif", true)
      .neq("statut_logique", "TERMINE")
      .neq("statut_logique", "NON_APPLICABLE")
      .order("echeance", { ascending: true })
      .limit(50);

    if (onlyOverdue) {
      q = q.lt("echeance", today);
    } else {
      q = q.gte("echeance", today).lte("echeance", cutoffIso);
    }
    if (typeof input.type === "string") {
      q = q.eq("type", input.type);
    }

    const { data, error } = await q;
    if (error) return { error: error.message };

    // Filtre client billable cote JS (RLS simple). Le type retourne par
    // Supabase pour la jointure !inner est mal inferre (clients en array),
    // on caste vers le type attendu.
    type OblRow = {
      type: string;
      echeance: string | null;
      statut_logique: string;
      statut_detail: string | null;
      clients: { slug: string; denomination: string; pipeline_statut: string | null; origine: string | null };
    };
    const rows = ((data ?? []) as unknown as OblRow[]).filter((o) =>
      isClientBillable(o.clients)
    );
    return {
      count: rows.length,
      window: onlyOverdue ? "en retard" : `${within} prochains jours`,
      obligations: rows.map((o) => ({
        client: o.clients.denomination,
        client_slug: o.clients.slug,
        type: o.type,
        echeance: o.echeance,
        statut: o.statut_logique,
        statut_detail: o.statut_detail,
      })),
    };
  },

  list_status_options: async (input, sb) => {
    const type = String(input.type ?? "").trim();
    if (!type) return { error: "Parametre 'type' manquant." };
    const { data, error } = await sb
      .from("status_options")
      .select("libelle, statut_logique, ordre, color")
      .eq("scope", "obligation")
      .eq("type_code", type)
      .eq("actif", true)
      .order("ordre");
    if (error) return { error: error.message };
    return { type, options: data ?? [] };
  },

  set_obligation_status: async (input, sb) => {
    const clientSearch = String(input.client_search ?? "").trim();
    const type = String(input.type ?? "").trim();
    const periode = String(input.periode ?? "").trim();
    const libelle = String(input.libelle ?? "").trim();
    if (!clientSearch || !type || !periode || !libelle) {
      return { error: "Parametres manquants : client_search, type, periode et libelle requis." };
    }

    // 1. Resoudre le client
    const cli = await resolveClient(sb, clientSearch);
    if (!cli.ok) return { error: cli.reason };

    // 2. Annee implicite a partir de la periode
    const annee = anneeFromPeriode(periode);
    if (!annee) {
      return { error: `Impossible de deduire l'annee depuis periode "${periode}". Format attendu : "YYYY-MM" ou "YYYY" ou "TQ-YYYY".` };
    }

    // 3. Verifier le libelle existe pour ce type (lookup tolerant -
    // accent / casse / "EDI / OK" vs "EDI") + recupere statut_logique
    const { data: opts } = await sb
      .from("status_options")
      .select("libelle, statut_logique")
      .eq("scope", "obligation")
      .eq("type_code", type)
      .eq("actif", true);
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const wanted = norm(libelle);
    const matched =
      opts?.find((o) => norm(o.libelle) === wanted) ??
      opts?.find((o) => norm(o.libelle).startsWith(wanted)) ??
      opts?.find((o) => norm(o.libelle).includes(wanted));
    if (!matched) {
      return {
        error: `Libelle "${libelle}" inconnu pour ${type}. Libelles dispo : ${opts?.map((o) => o.libelle).join(", ") ?? "(aucun)"}.`,
      };
    }

    // 4. Trouver la sub active
    const { data: sub } = await sb
      .from("obligation_subscriptions")
      .select("id")
      .eq("client_id", cli.id)
      .eq("type", type)
      .eq("annee", annee)
      .eq("actif", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) {
      return {
        error: `Aucune souscription active ${type} ${annee} pour ${cli.denomination}. Active-la dans la matrice du client.`,
      };
    }

    // 5. Upsert : lookup existant par (sub_id, periode) (= UNIQUE en schema)
    const { data: existing } = await sb
      .from("obligations")
      .select("id")
      .eq("subscription_id", sub.id)
      .eq("periode", periode)
      .maybeSingle();
    let obligationId = existing?.id ?? null;
    if (!obligationId) {
      const { data: inserted, error: insErr } = await sb
        .from("obligations")
        .insert({
          subscription_id: sub.id,
          client_id: cli.id,
          type,
          periode,
          annee,
          statut_logique: matched.statut_logique,
          statut_detail: matched.libelle,
        })
        .select("id")
        .single();
      if (insErr) return { error: insErr.message };
      obligationId = inserted.id;
    } else {
      const { error: updErr } = await sb
        .from("obligations")
        .update({ statut_logique: matched.statut_logique, statut_detail: matched.libelle })
        .eq("id", obligationId);
      if (updErr) return { error: updErr.message };
    }

    return {
      ok: true,
      client: cli.denomination,
      client_slug: cli.slug,
      client_id: cli.id,
      type,
      periode,
      libelle: matched.libelle,
      statut_logique: matched.statut_logique,
      obligation_id: obligationId,
    };
  },

  set_client_pipeline_statut: async (input, sb) => {
    const clientSearch = String(input.client_search ?? "").trim();
    const pipelineStatut = String(input.pipeline_statut ?? "").trim();
    if (!clientSearch || !pipelineStatut) {
      return { error: "Parametres manquants." };
    }
    const cli = await resolveClient(sb, clientSearch);
    if (!cli.ok) return { error: cli.reason };
    const { error } = await sb
      .from("clients")
      .update({ pipeline_statut: pipelineStatut })
      .eq("id", cli.id);
    if (error) return { error: error.message };
    return {
      ok: true,
      client: cli.denomination,
      client_slug: cli.slug,
      pipeline_statut: pipelineStatut,
    };
  },

  get_onboarding_progress: async (input, sb) => {
    if (typeof input.slug === "string") {
      const { data: client } = await sb
        .from("clients")
        .select("id, denomination")
        .eq("slug", input.slug)
        .maybeSingle();
      if (!client) return { error: "Client non trouve" };
      const { data: tasks } = await sb
        .from("onboarding_tasks")
        .select("task_key, statut_logique, statut_detail")
        .eq("client_id", client.id);
      const done = (tasks ?? []).filter(
        (t) => t.statut_logique === "TERMINE" || t.statut_logique === "NON_APPLICABLE"
      ).length;
      return {
        client: client.denomination,
        total: tasks?.length ?? 0,
        done,
        pct: tasks?.length ? Math.round((done / tasks.length) * 100) : 0,
        tasks: tasks ?? [],
      };
    }
    // Vue globale : tous les clients billable avec leur pct
    const { data: clients } = await sb
      .from("clients")
      .select("id, slug, denomination, pipeline_statut, origine");
    const billable = (clients ?? []).filter(isClientBillable);
    const { data: tasks } = await sb
      .from("onboarding_tasks")
      .select("client_id, statut_logique");
    const byClient = new Map<string, { total: number; done: number }>();
    for (const c of billable) byClient.set(c.id, { total: 0, done: 0 });
    for (const t of tasks ?? []) {
      const agg = byClient.get(t.client_id);
      if (!agg) continue;
      agg.total++;
      if (t.statut_logique === "TERMINE" || t.statut_logique === "NON_APPLICABLE") agg.done++;
    }
    return {
      count: billable.length,
      clients: billable
        .map((c) => {
          const a = byClient.get(c.id)!;
          return {
            slug: c.slug,
            denomination: c.denomination,
            total: a.total,
            done: a.done,
            pct: a.total > 0 ? Math.round((a.done / a.total) * 100) : 0,
          };
        })
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 50),
    };
  },
};
