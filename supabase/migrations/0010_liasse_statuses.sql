-- Statuts liasse/plaquette : nouvelle échelle progressive 0 → 4.
-- ----------------------------------------------------------------------------

-- 1. Migrer les obligations existantes vers la nouvelle nomenclature
update public.obligations
set statut_detail = '0 - A traiter'
where type = 'LIASSE_PLAQUETTE' and statut_detail = 'A traiter';

update public.obligations
set statut_detail = '4 - Plaquette transmise', statut_logique = 'TERMINE'
where type = 'LIASSE_PLAQUETTE' and statut_detail = 'EDI - Terminé';

-- 2. Supprimer les anciens libellés (sauf N/A qui reste valide)
delete from public.status_options
where scope = 'obligation'
  and type_code = 'LIASSE_PLAQUETTE'
  and libelle in ('A traiter', 'EDI - Terminé');

-- 3. Insérer les nouveaux libellés (ordre = progression linéaire)
insert into public.status_options (scope, type_code, libelle, statut_logique, ordre) values
  ('obligation', 'LIASSE_PLAQUETTE', '0 - A traiter',                'A_FAIRE',  10),
  ('obligation', 'LIASSE_PLAQUETTE', '1 - Points en suspens envoyés', 'EN_COURS', 20),
  ('obligation', 'LIASSE_PLAQUETTE', '2 - Projet envoyé',             'EN_COURS', 30),
  ('obligation', 'LIASSE_PLAQUETTE', '3 - Liasse déclarée',           'EN_COURS', 40),
  ('obligation', 'LIASSE_PLAQUETTE', '4 - Plaquette transmise',       'TERMINE',  50)
on conflict (scope, type_code, libelle) do nothing;
