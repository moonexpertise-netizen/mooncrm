-- Migration des données vers les nouvelles valeurs du pipeline.
-- Doit être dans une migration séparée car ALTER TYPE ADD VALUE (0019) n'est
-- pas disponible dans la même transaction que ses utilisations.
--
-- Mapping :
--   '1 - PC Préparée' → '4 - PC envoyée'   (déjà "préparée" = déjà envoyée chez Benjamin)
--   '5 - LDM Envoyée' → '6 - LDM envoyée'
--   '6 - LDM Signée'  → '7 - LDM signée'
--   Z - Interne, Z - Prospect perdu, Z - Résiliée → inchangés

update public.clients set pipeline_statut = '4 - PC envoyée' where pipeline_statut = '1 - PC Préparée';
update public.clients set pipeline_statut = '6 - LDM envoyée' where pipeline_statut = '5 - LDM Envoyée';
update public.clients set pipeline_statut = '7 - LDM signée' where pipeline_statut = '6 - LDM Signée';
