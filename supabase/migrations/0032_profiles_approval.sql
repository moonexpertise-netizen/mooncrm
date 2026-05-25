-- ============================================================================
-- Workflow d'inscription contrôlé pour MoonCRM (CRM interne MOON Expertise).
--
-- Double couche de sécurité :
--   1. Seuls les emails @moonexpertise.fr peuvent s'inscrire (validé par
--      trigger DB → impossible à contourner côté client).
--   2. Tout compte créé est `approved = false` par défaut. Benjamin (admin)
--      doit l'approuver via /admin/users pour qu'il puisse accéder à l'app.
--   3. Le compte de benjamin.perez@moonexpertise.fr est auto-approuvé + admin
--      (premier utilisateur, on ne va pas s'auto-approuver à la main).
-- ============================================================================

-- Table profiles : extension de auth.users avec flags métier MOON
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  is_admin boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_approved on public.profiles(approved);
create index if not exists idx_profiles_is_admin on public.profiles(is_admin);

-- RLS : un user peut lire son propre profile. Les admins peuvent tout
-- voir/modifier (utilisé pour la page /admin/users).
alter table public.profiles enable row level security;

drop policy if exists "user reads own profile" on public.profiles;
create policy "user reads own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Function : trigger handler appelé à chaque création d'auth.users.
-- 1. Refuse si l'email ne se termine pas par @moonexpertise.fr.
-- 2. Crée la row profile correspondante (approved=false sauf Benjamin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_founder boolean;
begin
  -- Validation domaine email : sécurité absolue côté DB (impossible à
  -- contourner depuis le client, même si quelqu'un tape signUp() à la main).
  if new.email is null or not (new.email ~* '@moonexpertise\.fr$') then
    raise exception 'Seuls les emails @moonexpertise.fr peuvent créer un compte sur MoonCRM.';
  end if;

  -- Benjamin = fondateur, auto-approuvé admin (impossible de demander à
  -- soi-même une approbation pour la création initiale).
  v_is_founder := (lower(new.email) = 'benjamin.perez@moonexpertise.fr');

  insert into public.profiles (id, email, approved, is_admin, approved_at)
  values (
    new.id,
    lower(new.email),
    v_is_founder,
    v_is_founder,
    case when v_is_founder then now() else null end
  );

  return new;
end;
$$;

-- Trigger : à chaque signup, valide email + crée profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rétro-compatibilité : si Benjamin avait déjà un compte créé via magic link
-- AVANT cette migration, le profile n'existe pas. On le crée manuellement.
insert into public.profiles (id, email, approved, is_admin, approved_at)
select id, lower(email), true, true, now()
from auth.users
where lower(email) = 'benjamin.perez@moonexpertise.fr'
on conflict (id) do update
  set approved = true,
      is_admin = true,
      approved_at = coalesce(public.profiles.approved_at, now());
