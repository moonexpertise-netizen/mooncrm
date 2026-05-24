-- ============================================================================
-- Refonte du modèle économique côté clients :
--   · forfait_pilotage (NOUVEAU) : forfait mensuel pilotage
--   · honoraires_compta : forfait mensuel comptable (déjà présent · libellé MAJ côté UI)
--   · honoraires_jur : forfait annuel juridique (déjà présent · libellé MAJ côté UI)
--   · exceptionnel : honoraires exceptionnels (intacts, hors calcul ARR/MRR)
--
-- mrr et arr deviennent des colonnes GENERATED :
--   · arr = (honoraires_compta + forfait_pilotage) * 12 + honoraires_jur
--   · mrr = honoraires_compta + forfait_pilotage + (honoraires_jur / 12)
--
-- Migration des données existantes : si honoraires_compta est nul ou zéro mais
-- mrr renseigné, on bascule mrr → honoraires_compta avant de droper la colonne
-- (sinon on perd les valeurs déjà saisies).
-- ============================================================================

-- 1. Nouvelle colonne
alter table public.clients
  add column if not exists forfait_pilotage numeric(10,2) NOT NULL DEFAULT 0;

-- 2. Sauvegarde des mrr non migrés vers honoraires_compta
update public.clients
set honoraires_compta = mrr
where (honoraires_compta is null or honoraires_compta = 0)
  and mrr is not null and mrr > 0;

-- 3. Drop des anciennes colonnes (arr est généré, doit être dropé en premier)
alter table public.clients drop column if exists arr;
alter table public.clients drop column if exists mrr;

-- 4. Recréation en colonnes générées avec la nouvelle formule
alter table public.clients
  add column mrr numeric(10,2) generated always as (
    coalesce(honoraires_compta, 0) + coalesce(forfait_pilotage, 0) + (coalesce(honoraires_jur, 0) / 12)
  ) stored;

alter table public.clients
  add column arr numeric(10,2) generated always as (
    (coalesce(honoraires_compta, 0) + coalesce(forfait_pilotage, 0)) * 12 + coalesce(honoraires_jur, 0)
  ) stored;
