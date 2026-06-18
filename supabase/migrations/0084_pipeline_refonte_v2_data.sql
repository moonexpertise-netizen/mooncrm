-- ============================================================================
-- Remap des données pipeline vers les nouvelles étapes (cf. 0083).
-- Migration SÉPARÉE de l'ajout des valeurs d'enum (contrainte Postgres).
--
-- Les ex-étapes « Tally » (1 et 2) deviennent « 1 - Rencontre prospect »
-- (= nouvelle entrée du tunnel). Les autres sont simplement renumérotées.
-- Les nouvelles étapes « 5 - Guide + Tally envoyé » et « 6 - LDM à préparer »
-- démarrent vides (aucun dossier remappé automatiquement).
-- ============================================================================

update public.clients set pipeline_statut = '1 - Rencontre prospect'
  where pipeline_statut in ('1 - Tally à envoyer', '2 - Tally à compléter');
update public.clients set pipeline_statut = '2 - PC à préparer'
  where pipeline_statut = '3 - PC à préparer';
update public.clients set pipeline_statut = '3 - PC envoyée'
  where pipeline_statut = '4 - PC envoyée';
update public.clients set pipeline_statut = '4 - PC acceptée'
  where pipeline_statut = '5 - PC acceptée';
update public.clients set pipeline_statut = '7 - LDM envoyée'
  where pipeline_statut = '6 - LDM envoyée';
update public.clients set pipeline_statut = '8 - LDM signée'
  where pipeline_statut = '7 - LDM signée';
