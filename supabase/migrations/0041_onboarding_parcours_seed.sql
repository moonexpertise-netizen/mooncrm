-- ============================================================================
-- Seed du parcours d'onboarding par défaut "Standard MOON".
--
-- Réplique en data la logique qui était codée en dur dans
-- app/onboarding/actions.ts → taskKeysFor() :
--
--   COMMUNES (toujours créées) :
--     1. Tally rempli
--     2. Accès Pennylane créé
--     3. Abonnement MOON actif
--     4. Mandat MOON signé
--     5. Accès impôt.gouv
--     6. Mandat impôts
--     7. CFE 1447
--     8. Onboarding Pennylane réalisé
--     9. Lettre d'option IR/IS
--
--   CRÉATION uniquement (N/A pour les autres origines) :
--    10. Dépôt KBIS auprès de la banque
--
--   REPRISE uniquement (N/A pour les autres origines) :
--    11. Reprise confrère
--
--   TNS uniquement (N/A si gestion_tns = false) :
--    12. Prévisionnel TNS réalisé
--    13. Affiliation TNS réalisée
--
-- Note : les étapes sont créées avec leurs conditions_na (= règles qui font
-- passer la tâche en NON_APPLICABLE auto à la création pour les dossiers
-- non concernés). On garde toutes les étapes dans tous les dossiers pour
-- garder une vue uniforme dans la matrice.
-- ============================================================================

-- Crée le parcours par défaut s'il n'existe pas déjà
insert into public.onboarding_parcours (id, nom, description, is_default)
values (
  '00000000-0000-0000-0000-000000000001',
  'Standard MOON',
  'Parcours d''onboarding par défaut pour tous les nouveaux dossiers signés. Couvre Création / Reprise / Interne / Sous-traitance avec ou sans gestion TNS.',
  true
)
on conflict (id) do nothing;

-- Insère les 13 étapes (ON CONFLICT sur (parcours_id, task_key) pour idempotence)
with parcours as (
  select id from public.onboarding_parcours where id = '00000000-0000-0000-0000-000000000001'
)
insert into public.onboarding_etape (parcours_id, task_key, libelle, ordre, categorie, conditions_na)
select p.id, e.task_key, e.libelle, e.ordre, e.categorie, e.conditions_na::jsonb
from parcours p, (values
  ( 1, 'tally_crea_pdc',      'Tally rempli',                                                    '2G', '[]'),
  ( 2, 'acces_pennylane',     'Accès Pennylane créé',                                            '2G', '[]'),
  -- Création uniquement : N/A pour Reprise / Interne / Sous-traitance / null
  ( 3, 'depot_kbis_banque',   'Dépôt KBIS auprès de la banque',                                  '2C',
      '[{"field":"origine","op":"not_in","value":["1 - Création"],"reason":"Étape de création — pas applicable hors Création"}]'),
  -- Reprise uniquement (avec ou sans EC) : N/A pour Création / Interne / Sous-traitance / null
  ( 4, 'confrere',            'Reprise confrère',                                                '2R',
      '[{"field":"origine","op":"not_in","value":["2 - Reprise","3 - Reprise sans EC"],"reason":"Étape de reprise — pas applicable hors Reprise"}]'),
  ( 5, 'abo_moon',            'Abonnement MOON actif',                                           '2G', '[]'),
  ( 6, 'mandat_moon',         'Mandat de prélèvement MOON signé',                                '2G', '[]'),
  ( 7, 'impot_gouv',          'Accès au compte impôt.gouv',                                      '2G', '[]'),
  ( 8, 'mandat_impots',       'Mandat des impôts signé et envoyé à la banque',                   '2G', '[]'),
  ( 9, 'cfe_1447',            '751-SD ou 1447 CFE signé et déposé sur messagerie',               '2G', '[]'),
  (10, 'ob_pennylane',        'Onboarding Pennylane réalisé',                                    '2G', '[]'),
  (11, 'option_ir_is',        'Lettre d''option IR/IS',                                          '2G', '[]'),
  -- TNS uniquement : N/A si gestion_tns != true
  (12, 'previ_tns',           'Prévisionnel TNS réalisé',                                        '2T',
      '[{"field":"gestion_tns","op":"neq","value":true,"reason":"Dossier non TNS"}]'),
  (13, 'affiliation_tns',     'Affiliation TNS réalisée',                                        '2T',
      '[{"field":"gestion_tns","op":"neq","value":true,"reason":"Dossier non TNS"}]')
) as e(ordre, task_key, libelle, categorie, conditions_na)
on conflict (parcours_id, task_key) do nothing;
