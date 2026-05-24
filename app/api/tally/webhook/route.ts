import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { extractGuesses, type TallyPayload } from "@/lib/tally-mapping";

/**
 * Webhook Tally : reçoit les soumissions et les stocke dans `tally_responses`
 * pour rattachement manuel via l'UI /inbox (l'utilisateur choisit le client).
 *
 * Côté Tally :
 *   1. Settings → Integrations → Webhooks → Add webhook
 *      URL : https://<domaine>/api/tally/webhook
 *      Signing secret : matche TALLY_WEBHOOK_SECRET
 *   2. Le rattachement client se fait MANUELLEMENT dans le CRM (pas par email).
 */

const SECRET = process.env.TALLY_WEBHOOK_SECRET ?? "";

function getAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!SECRET) return true; // pas de secret en dev
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
  const guesses = extractGuesses(fields);

  const sb = getAdmin();
  const { data, error } = await sb
    .from("tally_responses")
    .insert({
      form_id: payload.data.formId,
      form_name: payload.data.formName,
      response_id: payload.data.responseId,
      submission_id: payload.data.submissionId,
      payload,
      ...guesses,
    })
    .select("id")
    .single();

  if (error) {
    // Si conflit sur submission_id (doublon), on accepte silencieusement
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[tally webhook] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inboxId: data?.id, guesses });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Tally webhook listening. POST only." });
}
