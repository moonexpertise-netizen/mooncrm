-- ============================================================================
-- Regrouper les étapes d'un parcours d'onboarding en "rubriques" (sections).
--
-- Chaque rubrique a son propre style de numérotation (1/A/I/aucun) et peut
-- recommencer la numérotation à 1 ou continuer depuis la rubrique précédente.
--
-- Les étapes sans rubrique_id restent affichées en "flat" en tête de liste
-- (rétrocompatible avec le seed actuel qui n'utilise pas de rubrique).
-- ============================================================================

create table if not exists public.onboarding_rubrique (
  id uuid primary key default gen_random_uuid(),
  parcours_id uuid not null references public.onboarding_parcours(id) on delete cascade,
  nom text not null,
  ordre int not null,
  -- 'decimal' (1,2,3) | 'alpha' (A,B,C) | 'roman' (I,II,III) | 'none' (pas de numéro)
  numbering_style text not null default 'decimal'
    check (numbering_style in ('decimal', 'alpha', 'roman', 'none')),
  -- true : la numérotation redémarre à 1 (ou A, ou I) dans la rubrique.
  -- false : continue du compteur global.
  numbering_reset boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_onboarding_rubrique_parcours_ordre
  on public.onboarding_rubrique(parcours_id, ordre);

-- Lien étape → rubrique (nullable : étape "hors rubrique" possible)
alter table public.onboarding_etape
  add column if not exists rubrique_id uuid
  references public.onboarding_rubrique(id) on delete set null;

create index if not exists idx_onboarding_etape_rubrique
  on public.onboarding_etape(rubrique_id);

-- RLS : mêmes règles que onboarding_parcours / onboarding_etape
alter table public.onboarding_rubrique enable row level security;

drop policy if exists "approved users full access rubrique" on public.onboarding_rubrique;
create policy "approved users full access rubrique"
  on public.onboarding_rubrique for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  );

-- Trigger updated_at
create or replace function public.onboarding_rubrique_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_onboarding_rubrique_updated_at on public.onboarding_rubrique;
create trigger trg_onboarding_rubrique_updated_at
  before update on public.onboarding_rubrique
  for each row execute function public.onboarding_rubrique_touch_updated_at();
