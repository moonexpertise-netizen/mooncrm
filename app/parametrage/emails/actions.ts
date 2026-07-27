"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

/**
 * Enregistre un modèle d'e-mail (guide création / reprise). Réservé
 * edit_parametrage. Upsert sur la clé. Cf. migration 0085.
 */
const CLES_SYSTEME = new Set(["guide_creation", "guide_reprise", "mail_reprise"]);

export async function setEmailTemplate(
  key: "guide_creation" | "guide_reprise" | "mail_reprise",
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("edit_parametrage");
    if (!CLES_SYSTEME.has(key)) {
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
    // Le mail de reprise est lu par la fiche client (bouton Générer LDM).
    if (key === "mail_reprise") revalidatePath("/clients", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* --------------------------------------------------------------------------
 * Modèles de mails LIBRES (table mail_templates, migration 0093).
 * Utilisés par le bouton « Générer mail » de la fiche client et la génération
 * en masse depuis /documents.
 * ------------------------------------------------------------------------ */

type Resultat = { ok: boolean; error?: string; id?: string };

/** Revalide les écrans qui listent les modèles. */
function revalideModeles() {
  revalidatePath("/parametrage/emails");
  revalidatePath("/documents");
  revalidatePath("/clients", "layout");
}

function valideChamps(nom: string, objet: string, corps: string) {
  if (!nom.trim()) throw new Error("Le nom du modèle est obligatoire.");
  if (!objet.trim()) throw new Error("L'objet est obligatoire.");
  if (!corps.trim()) throw new Error("Le corps du message est obligatoire.");
}

/** Crée un modèle. Placé en fin de liste (ordre = max + 1). */
export async function createMailTemplate(input: {
  nom: string;
  categorie: string | null;
  objet: string;
  corps: string;
}): Promise<Resultat> {
  try {
    await requirePermission("edit_parametrage");
    valideChamps(input.nom, input.objet, input.corps);

    const sb = await createClient();
    const { data: dernier } = await sb
      .from("mail_templates")
      .select("ordre")
      .order("ordre", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await sb
      .from("mail_templates")
      .insert({
        nom: input.nom.trim(),
        categorie: input.categorie?.trim() || null,
        objet: input.objet.trim(),
        corps: input.corps.trim(),
        ordre: ((dernier?.ordre as number | undefined) ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    revalideModeles();
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Met à jour un modèle existant. */
export async function updateMailTemplate(
  id: string,
  input: { nom: string; categorie: string | null; objet: string; corps: string }
): Promise<Resultat> {
  try {
    await requirePermission("edit_parametrage");
    valideChamps(input.nom, input.objet, input.corps);

    const sb = await createClient();
    const { error } = await sb
      .from("mail_templates")
      .update({
        nom: input.nom.trim(),
        categorie: input.categorie?.trim() || null,
        objet: input.objet.trim(),
        corps: input.corps.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalideModeles();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Active / désactive un modèle (masqué du menu sans être supprimé). */
export async function toggleMailTemplate(id: string, actif: boolean): Promise<Resultat> {
  try {
    await requirePermission("edit_parametrage");
    const sb = await createClient();
    const { error } = await sb
      .from("mail_templates")
      .update({ actif, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalideModeles();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Duplique un modèle (« … (copie) »), pratique pour décliner une relance. */
export async function duplicateMailTemplate(id: string): Promise<Resultat> {
  try {
    await requirePermission("edit_parametrage");
    const sb = await createClient();
    const { data: src, error: readErr } = await sb
      .from("mail_templates")
      .select("nom, categorie, objet, corps, ordre")
      .eq("id", id)
      .single();
    if (readErr || !src) throw new Error(readErr?.message ?? "Modèle introuvable.");

    const { data, error } = await sb
      .from("mail_templates")
      .insert({
        nom: `${src.nom} (copie)`,
        categorie: src.categorie,
        objet: src.objet,
        corps: src.corps,
        ordre: (src.ordre as number) + 1,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    revalideModeles();
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteMailTemplate(id: string): Promise<Resultat> {
  try {
    await requirePermission("edit_parametrage");
    const sb = await createClient();
    const { error } = await sb.from("mail_templates").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalideModeles();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Déplace un modèle d'un cran dans la liste (sens = -1 monter, +1 descendre). */
export async function moveMailTemplate(id: string, sens: -1 | 1): Promise<Resultat> {
  try {
    await requirePermission("edit_parametrage");
    const sb = await createClient();
    const { data: tous, error: readErr } = await sb
      .from("mail_templates")
      .select("id, ordre")
      .order("ordre", { ascending: true })
      .order("nom", { ascending: true });
    if (readErr) throw new Error(readErr.message);

    const liste = (tous ?? []) as { id: string; ordre: number }[];
    const i = liste.findIndex((t) => t.id === id);
    const j = i + sens;
    if (i === -1 || j < 0 || j >= liste.length) return { ok: true }; // déjà en bout

    // Échange des rangs. On réécrit des positions denses (0..n) pour rester
    // stable même si des `ordre` égaux traînaient en base.
    const reordonne = [...liste];
    [reordonne[i], reordonne[j]] = [reordonne[j], reordonne[i]];
    for (let k = 0; k < reordonne.length; k++) {
      if (liste[k].id === reordonne[k].id && liste[k].ordre === k) continue;
      const { error } = await sb.from("mail_templates").update({ ordre: k }).eq("id", reordonne[k].id);
      if (error) throw new Error(error.message);
    }

    revalideModeles();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
