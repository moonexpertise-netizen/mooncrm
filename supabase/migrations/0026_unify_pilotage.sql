-- ============================================================================
-- Unification forfait_pilotage / tdb_honos_periode :
--   Avant : 2 champs distincts. Doublon, source de divergences (saisir l'un
--           sans l'autre laissait MRR incohérent).
--   Après : un seul champ source de vérité = tdb_honos_periode (montant par
--           période) + tdb_periode (Mensuel/Trimestriel/Non souscrit).
--           forfait_pilotage devient une colonne GENERATED dérivée :
--             · Mensuel        → forfait_pilotage = tdb_honos_periode
--             · Trimestriel    → forfait_pilotage = tdb_honos_periode / 3
--             · Non souscrit   → forfait_pilotage = 0
--           Idem pour MRR/ARR, qui sont recalculés.
-- ============================================================================

-- 1. Sauvegarde : si tdb_honos_periode est null/0 mais forfait_pilotage > 0,
--    on copie forfait_pilotage vers tdb_honos_periode (en supposant période
--    mensuelle - c'est le cas par défaut historique).
update public.clients
set tdb_honos_periode = forfait_pilotage,
    tdb_periode = 'Mensuel'::tdb_periode_t
where (tdb_honos_periode is null or tdb_honos_periode = 0)
  and forfait_pilotage > 0
  and tdb_periode is null;

-- 2. Drop des colonnes en cascade (mrr/arr dépendent de forfait_pilotage)
alter table public.clients drop column if exists mrr;
alter table public.clients drop column if exists arr;
alter table public.clients drop column if exists forfait_pilotage;

-- 3. Recréation : forfait_pilotage est désormais dérivé
alter table public.clients
  add column forfait_pilotage numeric(10,2) generated always as (
    case
      when tdb_periode = 'Mensuel'::tdb_periode_t then coalesce(tdb_honos_periode, 0)
      when tdb_periode = 'Trimestriel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) / 3.0
      else 0
    end
  ) stored;

-- 4. MRR / ARR : recalculés à partir de la source de vérité
alter table public.clients
  add column mrr numeric(10,2) generated always as (
    coalesce(honoraires_compta, 0)
    + (case
        when tdb_periode = 'Mensuel'::tdb_periode_t then coalesce(tdb_honos_periode, 0)
        when tdb_periode = 'Trimestriel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) / 3.0
        else 0
      end)
    + (coalesce(forfait_bilan, 0) / 12.0)
    + (coalesce(honoraires_jur, 0) / 12.0)
  ) stored;

alter table public.clients
  add column arr numeric(10,2) generated always as (
    coalesce(honoraires_compta, 0) * 12
    + (case
        when tdb_periode = 'Mensuel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) * 12
        when tdb_periode = 'Trimestriel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) * 4
        else 0
      end)
    + coalesce(forfait_bilan, 0)
    + coalesce(honoraires_jur, 0)
  ) stored;
