-- ============================================================================
-- 0066 - Commentaires sur les missions exceptionnelles
-- ============================================================================
--
-- Copie du systeme `obligation_comments` (migration 0036) pour les missions
-- exceptionnelles. Permet d'ajouter des notes / threads de discussion sur
-- chaque mission, accessibles via un popover style Notion.
--
-- Idempotent.
-- ============================================================================

create table if not exists public.mission_exc_comments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions_exceptionnelles(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete set null,
  content text not null check (length(content) > 0 and length(content) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_mission_exc_comments_mission
  on public.mission_exc_comments(mission_id, created_at desc);

create index if not exists idx_mission_exc_comments_author
  on public.mission_exc_comments(author_id);

-- RLS : tout user approuve peut lire, l'auteur peut editer / supprimer ses
-- propres commentaires. Aligne exactement sur obligation_comments.
alter table public.mission_exc_comments enable row level security;

drop policy if exists "approved users read mex comments" on public.mission_exc_comments;
create policy "approved users read mex comments"
  on public.mission_exc_comments for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved = true
    )
  );

drop policy if exists "approved users insert mex comments" on public.mission_exc_comments;
create policy "approved users insert mex comments"
  on public.mission_exc_comments for insert
  with check (
    author_id = auth.uid() and
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved = true
    )
  );

drop policy if exists "author updates own mex comments" on public.mission_exc_comments;
create policy "author updates own mex comments"
  on public.mission_exc_comments for update
  using (author_id = auth.uid());

drop policy if exists "author deletes own mex comments" on public.mission_exc_comments;
create policy "author deletes own mex comments"
  on public.mission_exc_comments for delete
  using (author_id = auth.uid());
