-- ============================================================================
-- Fix : récursion infinie dans les policies RLS de profiles.
--
-- Les policies "admins read all profiles" et "admins update profiles" de la
-- migration 0032 faisaient un EXISTS (select ... from profiles ...) → la
-- query déclenchait à son tour l'évaluation des policies → récursion.
--
-- Conséquence : TOUTE lecture de profiles plantait avec
-- "infinite recursion detected in policy for relation 'profiles'", y compris
-- la policy "user reads own profile" qui était combinée en OR. Le middleware
-- redirigait alors tous les users vers /en-attente.
--
-- Solution : utiliser une fonction SECURITY DEFINER qui interroge profiles
-- en bypassant la RLS. Les policies l'appellent au lieu d'un sous-select.
-- ============================================================================

-- 1. Supprimer les policies récursives
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;

-- 2. Fonction helper : retourne true si l'user courant est admin.
--    SECURITY DEFINER → tourne avec les privilèges du créateur (postgres),
--    qui bypass la RLS de profiles. Pas de récursion possible.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- 3. Permettre à l'anon + authenticated d'appeler la fonction
grant execute on function public.is_admin() to anon, authenticated;

-- 4. Re-créer les policies admin en utilisant la fonction (plus de récursion)
create policy "admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "admins update profiles"
  on public.profiles for update
  using (public.is_admin());
