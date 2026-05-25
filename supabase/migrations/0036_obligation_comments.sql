-- ============================================================================
-- Table obligation_comments : commentaires attachés à une obligation.
-- Inspiration Notion : système de thread chronologique par cellule.
--
-- L'auteur (author_id) référence auth.users → joinable avec public.profiles
-- pour récupérer l'email lors de l'affichage.
--
-- L'ancien champ `obligations.note` (texte libre simple) est conservé en
-- lecture pour compat, mais l'UI peut désormais privilégier les commentaires
-- (équivalent à un thread).
-- ============================================================================

create table if not exists public.obligation_comments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete set null,
  content text not null check (length(content) > 0 and length(content) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_obligation_comments_obligation
  on public.obligation_comments(obligation_id, created_at desc);

create index if not exists idx_obligation_comments_author
  on public.obligation_comments(author_id);

-- RLS : tout user approuvé peut lire les commentaires (CRM interne MOON).
-- L'auteur peut éditer/supprimer ses propres commentaires.
alter table public.obligation_comments enable row level security;

drop policy if exists "approved users read comments" on public.obligation_comments;
create policy "approved users read comments"
  on public.obligation_comments for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved = true
    )
  );

drop policy if exists "approved users insert comments" on public.obligation_comments;
create policy "approved users insert comments"
  on public.obligation_comments for insert
  with check (
    author_id = auth.uid() and
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved = true
    )
  );

drop policy if exists "author updates own comments" on public.obligation_comments;
create policy "author updates own comments"
  on public.obligation_comments for update
  using (author_id = auth.uid());

drop policy if exists "author deletes own comments" on public.obligation_comments;
create policy "author deletes own comments"
  on public.obligation_comments for delete
  using (author_id = auth.uid());

-- Trigger updated_at
create or replace function public.obligation_comments_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_obligation_comments_updated_at on public.obligation_comments;
create trigger trg_obligation_comments_updated_at
  before update on public.obligation_comments
  for each row execute function public.obligation_comments_touch_updated_at();
