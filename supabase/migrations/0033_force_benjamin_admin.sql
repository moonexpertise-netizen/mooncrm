-- ============================================================================
-- Hotfix : forcer benjamin.perez@moonexpertise.fr en admin approved.
-- Le trigger handle_new_user() de 0032 n'a pas auto-promu Benjamin (timing
-- de la migration vs la suppression/re-création de son compte). On force
-- via UPDATE direct sur sa row profiles.
-- ============================================================================

update public.profiles
set approved = true,
    is_admin = true,
    approved_at = coalesce(approved_at, now())
where lower(email) = 'benjamin.perez@moonexpertise.fr';
