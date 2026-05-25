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
 * Le SELECT est joinable sur profiles pour récupérer l'email de l'auteur
 * (utilisé pour l'affichage en thread).
 */
export async function listComments(obligationId: string): Promise<Comment[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("obligation_comments")
    .select("id, author_id, content, created_at, updated_at, profiles!inner(email)")
    .eq("obligation_id", obligationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    author_id: c.author_id,
    author_email: (c.profiles as unknown as { email: string }).email,
    content: c.content,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));
}

/**
 * Ajoute un commentaire sur une obligation. L'author_id est posé via
 * auth.uid() côté RLS — pas besoin de le passer en paramètre.
 */
export async function addComment(obligationId: string, content: string): Promise<Comment> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Le commentaire ne peut pas être vide.");
  if (trimmed.length > 4000) throw new Error("Commentaire trop long (max 4000 caractères).");

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await sb
    .from("obligation_comments")
    .insert({ obligation_id: obligationId, author_id: user.id, content: trimmed })
    .select("id, author_id, content, created_at, updated_at, profiles!inner(email)")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: data.id,
    author_id: data.author_id,
    author_email: (data.profiles as unknown as { email: string }).email,
    content: data.content,
    created_at: data.created_at,
    updated_at: data.updated_at,
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
