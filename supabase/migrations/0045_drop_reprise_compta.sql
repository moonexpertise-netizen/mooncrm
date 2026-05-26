-- ============================================================================
-- Nettoyage de la task_key legacy "reprise_compta".
--
-- Historique : dans le seed initial (0001 + 0002), l'enum onboarding_task_key
-- contenait 'reprise_compta' avec ses options de statut. Le workflow métier
-- Benjamin la remplace par 'confrere' (cf. migration 0041, parcours Standard
-- MOON). Aucun dossier nouveau ne crée plus cette tâche, mais elle peut
-- encore exister :
--   - dans onboarding_tasks pour d'anciens dossiers
--   - dans status_options (libellés OK - Validé / OK - N/A)
--
-- On supprime tout proprement. L'enum onboarding_task_key garde 'reprise_compta'
-- en valeur historique (Postgres n'autorise pas de DROP VALUE simple) mais
-- elle n'est plus référencée nulle part.
-- ============================================================================

-- 1. Supprime les tâches existantes pour les dossiers (rare, mais possible)
delete from public.onboarding_tasks
 where task_key = 'reprise_compta';

-- 2. Supprime les libellés de statut associés
delete from public.status_options
 where scope = 'onboarding'
   and type_code = 'reprise_compta';
