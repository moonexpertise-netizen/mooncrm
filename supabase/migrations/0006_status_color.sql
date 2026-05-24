-- ============================================================================
-- Ajoute une colonne `color` optionnelle sur status_options.
-- Permet d'avoir un statut qui visuellement diffère de la couleur par défaut
-- de son statut_logique. Ex : "Rejetée - à renvoyer" reste A_FAIRE mais
-- s'affiche en rouge.
-- Valeurs reconnues côté client : 'red', 'amber', 'blue', 'emerald', 'zinc',
-- 'violet'. NULL = utilise la couleur par défaut du statut_logique.
-- ============================================================================

alter table public.status_options
  add column if not exists color text;

-- Nouveaux libellés pour la TVA (mensuelle, trimestrielle, annuelle CA12, OSS,
-- DES, TVS) : Préparée (EN_COURS) et Rejetée - à renvoyer (A_FAIRE rouge).

insert into public.status_options (scope, type_code, libelle, statut_logique, ordre, color) values
  ('obligation', 'TVA_MENSUELLE', 'Préparée', 'EN_COURS', 15, null),
  ('obligation', 'TVA_MENSUELLE', 'Rejetée - à renvoyer', 'A_FAIRE', 5, 'red'),
  ('obligation', 'TVA_TRIMESTRIELLE', 'Préparée', 'EN_COURS', 15, null),
  ('obligation', 'TVA_TRIMESTRIELLE', 'Rejetée - à renvoyer', 'A_FAIRE', 5, 'red'),
  ('obligation', 'TVA_ANNUELLE_CA12', 'Préparée', 'EN_COURS', 15, null),
  ('obligation', 'TVA_ANNUELLE_CA12', 'Rejetée - à renvoyer', 'A_FAIRE', 5, 'red'),
  ('obligation', 'OSS', 'Préparée', 'EN_COURS', 15, null),
  ('obligation', 'OSS', 'Rejetée - à renvoyer', 'A_FAIRE', 5, 'red'),
  ('obligation', 'DES', 'Préparée', 'EN_COURS', 15, null),
  ('obligation', 'DES', 'Rejetée - à renvoyer', 'A_FAIRE', 5, 'red'),
  ('obligation', 'TVS', 'Préparée', 'EN_COURS', 15, null),
  ('obligation', 'TVS', 'Rejetée - à renvoyer', 'A_FAIRE', 5, 'red')
on conflict (scope, type_code, libelle) do nothing;
