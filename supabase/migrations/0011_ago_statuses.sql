-- AGO + dépôt : nouvelle échelle progressive 0 → 3.
-- ----------------------------------------------------------------------------

-- 1. Migrer les obligations existantes
update public.obligations
set statut_detail = '0 - A traiter'
where type = 'AGO_DEPOT' and statut_detail = 'A traiter';

update public.obligations
set statut_detail = '3 - Validé par greffe', statut_logique = 'TERMINE'
where type = 'AGO_DEPOT' and statut_detail = 'Validé';

-- 2. Supprimer les anciens libellés (N/A reste)
delete from public.status_options
where scope = 'obligation'
  and type_code = 'AGO_DEPOT'
  and libelle in ('A traiter', 'Validé');

-- 3. Insérer les nouveaux libellés
insert into public.status_options (scope, type_code, libelle, statut_logique, ordre) values
  ('obligation', 'AGO_DEPOT', '0 - A traiter',           'A_FAIRE',  10),
  ('obligation', 'AGO_DEPOT', '1 - Envoyé en signature', 'EN_COURS', 20),
  ('obligation', 'AGO_DEPOT', '2 - Déposé',              'EN_COURS', 30),
  ('obligation', 'AGO_DEPOT', '3 - Validé par greffe',   'TERMINE',  40)
on conflict (scope, type_code, libelle) do nothing;
