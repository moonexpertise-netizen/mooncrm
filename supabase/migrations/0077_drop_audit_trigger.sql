-- ============================================================================
-- Drop le trigger Postgres d'audit qui ne firait jamais
--
-- Apres 4 migrations (0072-0076) le trigger reste muet : pas une seule
-- entree dans client_audit_log meme apres UPDATE direct via SQL Editor.
-- Cause exacte non identifiee (probablement specificite de l'instance
-- Supabase).
--
-- On bascule sur du logging cote application (cf. lib/audit-log.ts +
-- hooks dans app/clients/[slug]/actions.ts). Plus simple, testable en
-- local, sous controle.
--
-- On GARDE la table client_audit_log (l'UI Historique l'utilise) et son
-- schema. On supprime juste le trigger et la fonction.
-- ============================================================================

drop trigger if exists trg_clients_audit on public.clients;
drop function if exists public.audit_client_changes() cascade;
drop function if exists public.debug_audit() cascade;
