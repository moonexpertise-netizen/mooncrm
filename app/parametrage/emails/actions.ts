"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

/**
 * Enregistre un modèle d'e-mail (guide création / reprise). Réservé
 * edit_parametrage. Upsert sur la clé. Cf. migration 0085.
 */
export async function setEmailTemplate(
  key: "guide_creation" | "guide_reprise",
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("edit_parametrage");
    if (key !== "guide_creation" && key !== "guide_reprise") {
      throw new Error("Modèle inconnu.");
    }
    const s = subject.trim();
    const b = body.trim();
    if (!s) throw new Error("L'objet est obligatoire.");
    if (!b) throw new Error("Le corps du message est obligatoire.");

    const sb = await createClient();
    const { error } = await sb
      .from("email_templates")
      .upsert(
        { key, subject: s, body: b, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw new Error(error.message);
    revalidatePath("/parametrage/emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
