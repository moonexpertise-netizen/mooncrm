-- ============================================================================
-- Date de prise en charge (début des obligations) par client.
-- Détermine à partir de quand le cabinet MOON suit le dossier. Le moteur
-- ne génère pas d'instances avec une période antérieure à cette date.
-- ----------------------------------------------------------------------------
-- Par défaut sur les dossiers existants : 2024-01-01, avant tout l'historique
-- importé (donc rien ne change pour eux). À ajuster manuellement si besoin.
-- ============================================================================

alter table public.clients
  add column if not exists debut_obligations date not null default '2024-01-01';
