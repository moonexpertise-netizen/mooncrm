-- ============================================================================
-- Rôles & permissions utilisateur (MoonCRM).
--
-- Avant : 2 niveaux seulement (approved + is_admin). Maintenant : un vrai
-- rôle par compte, choisi à l'approbation. 4 rôles :
--   admin / collaborateur / lecture / externe
-- La matrice rôle→permissions vit dans le code (lib/permissions.ts), seule
-- source de vérité. La colonne `role` ne stocke que le rôle.
--
-- is_admin est CONSERVÉ et SYNCHRONISÉ automatiquement (= role 'admin') pour
-- la rétro-compat (RLS existantes + middleware/code legacy).
-- ============================================================================

-- 1. Colonne role (défaut 'externe' = le plus restrictif, sûr par défaut ;
--    le vrai rôle est posé à l'approbation).
alter table public.profiles
  add column if not exists role text not null default 'externe';

-- Contrainte de valeurs autorisées
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'collaborateur', 'lecture', 'externe'));

-- 2. Backfill SANS casser l'existant :
--    - admins actuels      -> 'admin'
--    - approuvés non-admin -> 'collaborateur' (ils avaient l'accès complet avant)
--    - non approuvés       -> restent 'externe' (rôle posé à l'approbation)
update public.profiles set role = 'admin' where is_admin = true;
update public.profiles set role = 'collaborateur'
  where approved = true and is_admin = false;

-- 3. Sync automatique is_admin <- (role = 'admin'). Garantit que les 2 ne
--    divergent jamais, quel que soit le chemin d'écriture (action, SQL...).
create or replace function public.sync_profile_is_admin()
returns trigger
language plpgsql
as $$
begin
  new.is_admin := (new.role = 'admin');
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_is_admin on public.profiles;
create trigger trg_sync_profile_is_admin
  before insert or update of role on public.profiles
  for each row execute function public.sync_profile_is_admin();

-- 4. Nouveau signup : pose le rôle. Fondateur = admin, sinon externe
--    (non approuvé de toute façon, le rôle réel est choisi à l'approbation).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_founder boolean;
begin
  if new.email is null or not (new.email ~* '@moonexpertise\.fr$') then
    raise exception 'Seuls les emails @moonexpertise.fr peuvent créer un compte sur MoonCRM.';
  end if;

  v_is_founder := (lower(new.email) = 'benjamin.perez@moonexpertise.fr');

  insert into public.profiles (id, email, approved, is_admin, role, approved_at)
  values (
    new.id,
    lower(new.email),
    v_is_founder,
    v_is_founder,
    case when v_is_founder then 'admin' else 'externe' end,
    case when v_is_founder then now() else null end
  );

  return new;
end;
$$;

-- index pour filtrer par rôle (page admin)
create index if not exists idx_profiles_role on public.profiles(role);
