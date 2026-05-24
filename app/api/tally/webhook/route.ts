import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

/**
 * Webhook Tally : reçoit les soumissions des formulaires (création / reprise).
 *
 * Côté Tally :
 *   1. Settings → Integrations → Webhooks → Add webhook
 *      URL : https://<ton-domaine>/api/tally/webhook
 *      Signing secret : matche TALLY_WEBHOOK_SECRET dans .env.local
 *   2. Pour identifier le dossier : ajouter un champ "Hidden field"
 *      avec nom `client_id` dans chaque formulaire. Le CRM pré-remplit via
 *      l'URL `?client_id=UUID` quand tu cliques "Envoyer Tally".
 *
 * Le mapping des champs (label → colonne DB) est défini dans `FIELD_MAP`.
 * On match d'abord sur `label` exact, puis sur une regex laxiste.
 */

const SECRET = process.env.TALLY_WEBHOOK_SECRET ?? "";

type TallyField = {
  key: string;
  label: string;
  type: string;
  value: string | string[] | number | boolean | null;
};

type TallyPayload = {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: {
    responseId: string;
    submissionId: string;
    formId: string;
    formName: string;
    fields: TallyField[];
  };
};

// Valeurs valides des enums DB (côté supabase/migrations/0001_schema.sql + ajouts).
// `activite` n'est plus un enum (champ texte libre depuis migration 0022).
const FORME_VALUES = new Set([
  "ASSO", "SA", "SCI", "EI", "SARL", "SAS", "SELARL", "SELAS",
  "SCM", "SC", "EURL", "SASU", "INDIV", "AARPI", "LMNP",
]);

/** Normalise une valeur d'enum : trim + uppercase. Renvoie null si pas dans la whitelist. */
function normalizeEnum(value: string, allowed: Set<string>): string | null {
  const up = value.trim().toUpperCase();
  return allowed.has(up) ? up : null;
}

/**
 * Mapping des labels Tally vers les colonnes CRM. Le matching est insensible
 * à la casse et tolérant aux accents/espaces. Ajoute des entrées au fur et
 * à mesure que tu identifies les champs dans tes formulaires.
 *
 * Pattern : { regex de match sur label, colonne DB, transformation optionnelle }
 * Si transform renvoie null → on saute le champ (au lieu de planter le webhook).
 */
const FIELD_MAP: Array<{
  re: RegExp;
  field: string;
  transform?: (v: string) => string | null;
}> = [
  // Identité client
  { re: /(nom|d[ée]nomination).*soci[ée]t[ée]|raison.?sociale/i, field: "denomination" },
  { re: /^siren$|num[ée]ro.*siren/i, field: "siren", transform: (v) => v.replace(/\D/g, "") || null },
  { re: /forme.?juridique/i, field: "forme", transform: (v) => normalizeEnum(v, FORME_VALUES) },
  { re: /activit[ée]/i, field: "activite" }, // text libre
  { re: /^email$|adresse.?mail|courriel/i, field: "email", transform: (v) => v.toLowerCase().trim() },

  // Adresse siège
  { re: /adresse.*si[èe]ge|adresse.*social/i, field: "adresse_siege" },
  { re: /code.?postal|^cp$/i, field: "code_postal", transform: (v) => v.replace(/\D/g, "").slice(0, 5) || null },
  { re: /^ville$|commune/i, field: "ville" },

  // Dirigeant — stockés sur le contact, traités séparément dans le handler
];

/**
 * Trouve une valeur dans les fields Tally pour un alias de label donné.
 */
function findFieldValue(fields: TallyField[], pattern: RegExp): string | null {
  for (const f of fields) {
    if (pattern.test(f.label) || pattern.test(f.key)) {
      const v = f.value;
      if (v === null || v === undefined) return null;
      if (Array.isArray(v)) return v.join(", ");
      return String(v).trim() || null;
    }
  }
  return null;
}

function getAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Vérifie la signature HMAC envoyée par Tally dans le header `tally-signature`. */
function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!SECRET) return true; // Pas de secret configuré → on accepte (dev only)
  if (!signature) return false;
  const computed = createHmac("sha256", SECRET).update(rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const sig = request.headers.get("tally-signature");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: TallyPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (payload.eventType !== "FORM_RESPONSE") {
    return NextResponse.json({ ok: true, skipped: payload.eventType });
  }

  const fields = payload.data?.fields ?? [];
  const sb = getAdmin();

  // 1. Identifie le client. Stratégie en cascade :
  //    a. client_id (hidden field — si Gamma personnalisée par prospect)
  //    b. SIREN (matche un client existant — Reprise)
  //    c. email (matche un client existant — Création, pas de SIREN)
  let clientId = findFieldValue(fields, /^client.?id$/i);

  if (!clientId) {
    const siren = findFieldValue(fields, /^siren$|num[ée]ro.*siren/i)?.replace(/\D/g, "");
    if (siren && siren.length === 9) {
      const { data } = await sb.from("clients").select("id").eq("siren", siren).maybeSingle();
      if (data) clientId = data.id;
    }
  }

  if (!clientId) {
    const email = findFieldValue(fields, /^email$|adresse.?mail|courriel/i)?.toLowerCase();
    if (email) {
      const { data } = await sb.from("clients").select("id").ilike("email", email).maybeSingle();
      if (data) clientId = data.id;
    }
  }

  if (!clientId) {
    console.warn(
      "[tally webhook] impossible d'identifier le client (ni client_id, ni SIREN, ni email). Payload :",
      JSON.stringify(payload).slice(0, 800)
    );
    return NextResponse.json(
      { error: "client introuvable (identifier via client_id, SIREN ou email)" },
      { status: 404 }
    );
  }

  // 2. Construit le patch à appliquer au client. Si transform renvoie null
  //    (valeur invalide pour un enum), on saute le champ avec un log warning.
  const patch: Record<string, string | null> = {};
  const skipped: string[] = [];
  for (const { re, field, transform } of FIELD_MAP) {
    const raw = findFieldValue(fields, re);
    if (raw === null || raw === "") continue;
    const normalized = transform ? transform(raw) : raw;
    if (normalized === null) {
      skipped.push(`${field}="${raw}" (valeur non reconnue)`);
      continue;
    }
    patch[field] = normalized;
  }
  if (skipped.length) {
    console.warn(`[tally webhook] champs ignorés pour client ${clientId}:`, skipped.join("; "));
  }

  // 3. Met à jour le client
  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("clients").update(patch).eq("id", clientId);
    if (error) {
      console.error("[tally webhook] update client failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 4. Si dirigeant fourni, crée/lie un contact
  const dirigeantNom = findFieldValue(fields, /nom.*dirigeant|nom\s*(?:&|et)?\s*pr[ée]nom/i);
  const dirigeantPrenom = findFieldValue(fields, /pr[ée]nom.*dirigeant|^pr[ée]nom$/i);
  const dirigeantCivilite = findFieldValue(fields, /civilit[ée]|^titre$|^genre$/i);
  const dirigeantEmail = findFieldValue(fields, /email.*dirigeant|email.*contact/i);
  const dirigeantTel = findFieldValue(fields, /t[ée]l[ée]phone|^tel$|^t[ée]l$/i);

  const fullName = [dirigeantPrenom, dirigeantNom].filter(Boolean).join(" ").trim() || dirigeantNom;
  if (fullName) {
    // Réutilise un contact existant si même nom
    const { data: existingContact } = await sb
      .from("contacts")
      .select("id")
      .eq("nom", fullName)
      .maybeSingle();
    let contactId: string;
    if (existingContact) {
      contactId = existingContact.id;
      const update: Record<string, string | null> = {};
      if (dirigeantEmail) update.email = dirigeantEmail;
      if (dirigeantTel) update.telephone = dirigeantTel;
      if (dirigeantCivilite) {
        const civ = dirigeantCivilite.toLowerCase();
        update.civilite = civ.startsWith("mme") ? "Mme" : civ.startsWith("mlle") ? "Mlle" : "M.";
      }
      if (Object.keys(update).length > 0) {
        await sb.from("contacts").update(update).eq("id", contactId);
      }
    } else {
      const { data: created } = await sb
        .from("contacts")
        .insert({
          nom: fullName,
          email: dirigeantEmail,
          telephone: dirigeantTel,
          civilite: dirigeantCivilite
            ? dirigeantCivilite.toLowerCase().startsWith("mme")
              ? "Mme"
              : dirigeantCivilite.toLowerCase().startsWith("mlle")
              ? "Mlle"
              : "M."
            : null,
        })
        .select("id")
        .single();
      contactId = created?.id ?? "";
    }

    if (contactId) {
      // Lie le contact au client (idempotent)
      await sb
        .from("client_contacts")
        .upsert({ client_id: clientId, contact_id: contactId, role: "Dirigeant" }, { onConflict: "client_id,contact_id" });
    }
  }

  // 5. Avance le pipeline : "2 - Tally à compléter" → "3 - PC à préparer"
  const { data: current } = await sb
    .from("clients")
    .select("pipeline_statut")
    .eq("id", clientId)
    .single();
  if (current?.pipeline_statut === "2 - Tally à compléter" || current?.pipeline_statut === "1 - Tally à envoyer") {
    await sb
      .from("clients")
      .update({ pipeline_statut: "3 - PC à préparer" })
      .eq("id", clientId);
  }

  return NextResponse.json({
    ok: true,
    clientId,
    patchedFields: Object.keys(patch),
    contactCreated: !!fullName,
  });
}

// Permet GET pour test "le webhook est-il en ligne ?"
export async function GET() {
  return NextResponse.json({ ok: true, message: "Tally webhook listening. POST only." });
}
