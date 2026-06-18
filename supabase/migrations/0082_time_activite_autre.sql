-- ============================================================================
-- Ajoute l'activité « Autre » à la liste des activités de saisie des temps.
-- Permet de saisir un temps sans activité prédéfinie + une précision dans le
-- champ commentaire. Idempotent (unique(libelle)).
-- ============================================================================
insert into public.time_activites (libelle, ordre, facturable_defaut) values
  ('Autre', 999, true)
on conflict (libelle) do nothing;
