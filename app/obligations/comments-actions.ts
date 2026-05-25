"use server";

import { createClient } from "@/lib/supabase/server";

export type Comment = {
  id: string;
  author_id: string;
  author_email: string;
  content: string;
  created_at: string;
  updated_at: string | null;
};

/**
 * Liste les commentaires d'une obligation par ordre chronologique.
 *
 * Note : obligation_comments.author_id pointe vers auth.users(id), pas
 * directement vers public.profiles(id), donc PostgREST ne peut pas faire
 * le join automatique. On fetch les emails séparément depuis profiles
 * (qui partage le même id qu'auth.users via la FK) puis on assemble.
 */
export async function listComments(obligationId: string): Promise<Comment[]> {
  const sb = await createClient();
  const { data: rows, error } = await sb
    .from("obligation_comments")
    .select("id, author_id, content, created_at, updated_at")
    .eq("obligation_id", obligationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, email")
    .in("id", authorIds);
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return rows.map((c) => ({
    id: c.id,
    author_id: c.author_id,
    author_email: emailById.get(c.author_id) ?? "Inconnu",
    content: c.content,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));
}

/**
 * Ajoute un commentaire sur une obligation. L'author_id est l'utilisateur
 * courant (validé côté RLS). L'email auteur vient de profiles (join manuel
 * vu que la FK pointe vers auth.users).
 */
export async function addComment(obligationId: string, content: string): Promise<Comment> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Le commentaire ne peut pas être vide.");
  if (trimmed.length > 4000) throw new Error("Commentaire trop long (max 4000 caractères).");

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: inserted, error } = await sb
    .from("obligation_comments")
    .insert({ obligation_id: obligationId, author_id: user.id, content: trimmed })
    .select("id, author_id, content, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);

  // Email auteur (1 query, mais on connaît déjà le user logué = auteur)
  return {
    id: inserted.id,
    author_id: inserted.author_id,
    author_email: user.email ?? "Moi",
    content: inserted.content,
    created_at: inserted.created_at,
    updated_at: inserted.updated_at,
  };
}

/** Édite un commentaire (RLS limite à l'auteur). */
export async function editComment(commentId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Le commentaire ne peut pas être vide.");
  if (trimmed.length > 4000) throw new Error("Commentaire trop long.");

  const sb = await createClient();
  const { error } = await sb
    .from("obligation_comments")
    .update({ content: trimmed })
    .eq("id", commentId);
  if (error) throw new Error(error.message);
}

/** Supprime un commentaire (RLS limite à l'auteur). */
export async function deleteComment(commentId: string) {
  const sb = await createClient();
  const { error } = await sb.from("obligation_comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}

/**
 * Compte les commentaires par obligation pour un set d'IDs.
 * Utilisé par le tracker pour afficher l'indicateur "💬 3" sur les cellules.
 */
export async function countCommentsByObligation(
  obligationIds: string[]
): Promise<Record<string, number>> {
  if (!obligationIds.length) return {};
  const sb = await createClient();
  const { data, error } = await sb
    .from("obligation_comments")
    .select("obligation_id")
    .in("obligation_id", obligationIds);
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.obligation_id] = (counts[row.obligation_id] ?? 0) + 1;
  }
  return counts;
}
