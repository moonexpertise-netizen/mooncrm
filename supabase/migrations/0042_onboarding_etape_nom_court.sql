-- ============================================================================
-- Distinction "nom court" (entête de colonne matrice) vs "libellé complet"
-- (titre détaillé affiché en checklist).
--
-- Avant cette migration :
--   - onboarding_etape.libelle = "Tally rempli" (le libellé complet)
--   - les noms courts ("Tally", "Pennylane", "KBIS banque"…) étaient
--     hardcodés en TS dans matrice-table.tsx → TASK_SHORT_LABEL
--
-- Après :
--   - nom_court = nom court pour les entêtes matrice (modifiable depuis
--     l'éditeur de parcours)
--   - libelle   = libellé complet / description (modifiable aussi)
-- ============================================================================

alter table public.onboarding_etape
  add column if not exists nom_court text;

-- Backfill : remplit nom_court avec les valeurs courtes historiques
-- pour les étapes des 13 task_keys connus. Pour toute étape custom future
-- créée sans nom_court, on prend le libellé tronqué (cf. action côté serveur).
update public.onboarding_etape
   set nom_court = case task_key
     when 'tally_crea_pdc'    then 'Tally'
     when 'acces_pennylane'   then 'Pennylane'
     when 'depot_kbis_banque' then 'KBIS banque'
     when 'confrere'          then 'Confrère'
     when 'abo_moon'          then 'Abo MOON'
     when 'mandat_moon'       then 'Mandat MOON'
     when 'impot_gouv'        then 'impôt.gouv'
     when 'mandat_impots'     then 'Mandat impôts'
     when 'cfe_1447'          then 'CFE 1447'
     when 'ob_pennylane'      then 'OB Pennylane'
     when 'option_ir_is'      then 'IR/IS'
     when 'previ_tns'         then 'Prévi TNS'
     when 'affiliation_tns'   then 'Affiliation TNS'
     else libelle
   end
 where nom_court is null;

-- Force NOT NULL maintenant que tout est rempli
alter table public.onboarding_etape
  alter column nom_court set not null;

comment on column public.onboarding_etape.nom_court is
  'Nom court de l''étape pour les entêtes de colonne dans la matrice transverse (ex: "Tally"). À distinguer de `libelle` qui est le libellé complet ("Tally rempli") utilisé dans les checklists et tooltips.';
