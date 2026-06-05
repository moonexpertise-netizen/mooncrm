"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Commentaires sur les missions exceptionnelles. Pattern strictement aligne
 * sur obligation_comments (cf. /obligations/comments-actions). Voir
 * migration 0066 pour le schema et les policies RLS.
 */
export type MissionExcComment = {
  id: string;
  author_id: string;
  author_email: string;
  content: string;
  created_at: string;
  updated_at: string | null;
};

/** Liste les commentaires d'une mission par ordre chronologique. */
export async function listMissionExcComments(missionId: string): Promise<MissionExcComment[]> {
  const sb = await createClient();
  const { data: rows, error } = await sb
    .from("mission_exc_comments")
    .select("id, author_id, content, created_at, updated_at")
    .eq("mission_id", missionId)
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

/** Ajoute un commentaire sur une mission exc. */
export async function addMissionExcComment(missionId: string, content: string): Promise<MissionExcComment> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Le commentaire ne peut pas être vide.");
  if (trimmed.length > 4000) throw new Error("Commentaire trop long (max 4000 caractères).");

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: inserted, error } = await sb
    .from("mission_exc_comments")
    .insert({ mission_id: missionId, author_id: user.id, content: trimmed })
    .select("id, author_id, content, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: inserted.id,
    author_id: inserted.author_id,
    author_email: user.email ?? "Moi",
    content: inserted.content,
    created_at: inserted.created_at,
    updated_at: inserted.updated_at,
  };
}

/** Supprime un commentaire (RLS limite a l'auteur). */
export async function deleteMissionExcComment(commentId: string) {
  const sb = await createClient();
  const { error } = await sb.from("mission_exc_comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}

/** Compte les commentaires par mission pour un set d'IDs (pour l'indicateur). */
export async function countMissionExcComments(missionIds: string[]): Promise<Record<string, number>> {
  if (!missionIds.length) return {};
  const sb = await createClient();
  const { data, error } = await sb
    .from("mission_exc_comments")
    .select("mission_id")
    .in("mission_id", missionIds);
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.mission_id] = (counts[row.mission_id] ?? 0) + 1;
  }
  return counts;
}
