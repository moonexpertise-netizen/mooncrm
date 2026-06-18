-- ============================================================================
-- Lecture des profils par les utilisateurs approuvés.
--
-- Besoin : afficher le NOM du collaborateur sur les saisies de temps (planning
-- d'équipe), et plus largement partout où on montre "qui a fait quoi".
--
-- Avant : un non-admin ne pouvait lire QUE son propre profil (cf. 0032/0034),
-- donc les noms des autres collaborateurs étaient invisibles côté planning.
--
-- On ajoute une policy SELECT pour tout utilisateur approuvé. Comme pour
-- is_admin() (migration 0034), on passe par une fonction SECURITY DEFINER
-- pour éviter la récursion infinie des policies sur profiles.
--
-- Cohérent avec le modèle interne du CRM (honoraires, role_permissions déjà
-- lisibles par l'équipe).
-- ============================================================================

create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select approved from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_approved() to anon, authenticated;

drop policy if exists "approved read profiles" on public.profiles;
create policy "approved read profiles"
  on public.profiles for select
  using (public.is_approved());
