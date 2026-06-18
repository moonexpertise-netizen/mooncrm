-- ============================================================================
-- Refonte du pipeline commercial (v2). Nouvelles étapes actives :
--   1 - Rencontre prospect   (remplace les ex. 1/2 « Tally »)
--   2 - PC à préparer
--   3 - PC envoyée
--   4 - PC acceptée
--   5 - Guide + Tally envoyé (nouveau)
--   6 - LDM à préparer       (nouveau)
--   7 - LDM envoyée
--   8 - LDM signée
-- Les étapes terminales « Z - … » ne changent pas.
--
-- pipeline_statut est un ENUM : on ne peut QU'AJOUTER des valeurs (pas en
-- retirer). On ajoute donc les nouvelles ici ; le remap des données se fait
-- dans une migration SÉPARÉE (0084) car on ne peut pas utiliser une valeur
-- d'enum fraîchement ajoutée dans la même transaction. Les anciennes valeurs
-- (« 1 - Tally à envoyer », etc.) restent dans l'enum mais ne sont plus
-- exposées dans l'UI.
-- ============================================================================

alter type pipeline_statut add value if not exists '1 - Rencontre prospect';
alter type pipeline_statut add value if not exists '2 - PC à préparer';
alter type pipeline_statut add value if not exists '3 - PC envoyée';
alter type pipeline_statut add value if not exists '4 - PC acceptée';
alter type pipeline_statut add value if not exists '5 - Guide + Tally envoyé';
alter type pipeline_statut add value if not exists '6 - LDM à préparer';
alter type pipeline_statut add value if not exists '7 - LDM envoyée';
alter type pipeline_statut add value if not exists '8 - LDM signée';
