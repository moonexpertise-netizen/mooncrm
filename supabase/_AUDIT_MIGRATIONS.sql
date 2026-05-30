-- ============================================================================
-- AUDIT MIGRATIONS : detecte ce qui est applique vs en attente.
--
-- Lance ce script dans le SQL Editor de Supabase Dashboard.
-- Il ne modifie RIEN, c'est juste un check.
--
-- Couvre les migrations 0050-0054 (les plus recentes / les plus probablement
-- non appliquees). Les migrations < 0050 sont anciennes et tres probablement
-- en place puisque l'app fonctionne.
-- ============================================================================

with checks as (

  -- ===== 0050 : etat_facturation =====
  select '0050' as mig, 'Colonne etat_facturation sur obligations' as test,
    exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'obligations' and column_name = 'etat_facturation'
    ) as applied
  union all
  select '0050', 'Colonne etat_facturation sur ir_obligations',
    exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ir_obligations' and column_name = 'etat_facturation'
    )
  union all
  select '0050', 'Colonne etat_facturation sur caa_obligations',
    exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'caa_obligations' and column_name = 'etat_facturation'
    )

  -- ===== 0051 : AGO Depose -> TERMINE (status_options seed) =====
  -- ilike '%depos%' ne matche pas 'Deposé' a cause de l'accent (é != e en
  -- LIKE pattern). On match avec underscore wildcard ou comparaison directe.
  union all
  select '0051', 'AGO ''2 - Depose'' classe TERMINE dans status_options',
    exists(
      select 1 from public.status_options
      where scope = 'obligation' and type_code = 'AGO_DEPOT'
        and (libelle = '2 - Déposé' or libelle ilike '%d_pos%')
        and statut_logique = 'TERMINE'
    )

  -- ===== 0052 : drop 'payee' du CHECK constraint =====
  union all
  select '0052', 'CHECK constraint obligations.etat_facturation sans ''payee''',
    not exists(
      select 1 from public.obligations where etat_facturation = 'payee'
    )

  -- ===== 0053 : forfait sur ir_obligations + caa_obligations =====
  union all
  select '0053', 'Colonne forfait sur ir_obligations',
    exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ir_obligations' and column_name = 'forfait'
    )
  union all
  select '0053', 'Colonne forfait sur caa_obligations',
    exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'caa_obligations' and column_name = 'forfait'
    )

  -- ===== 0054 : triggers auto-facturation =====
  union all
  select '0054', 'Trigger trg_ir_obligations_auto_facturation',
    exists(
      select 1 from information_schema.triggers
      where event_object_schema = 'public' and trigger_name = 'trg_ir_obligations_auto_facturation'
    )
  union all
  select '0054', 'Trigger trg_caa_obligations_auto_facturation',
    exists(
      select 1 from information_schema.triggers
      where event_object_schema = 'public' and trigger_name = 'trg_caa_obligations_auto_facturation'
    )
  union all
  select '0054', 'Trigger trg_obligations_auto_facturation',
    exists(
      select 1 from information_schema.triggers
      where event_object_schema = 'public' and trigger_name = 'trg_obligations_auto_facturation'
    )
  union all
  select '0054', 'Trigger trg_mex_auto_facturation',
    exists(
      select 1 from information_schema.triggers
      where event_object_schema = 'public' and trigger_name = 'trg_mex_auto_facturation'
    )
  union all
  select '0054', 'Backfill : aucun TERMINE sans etat_facturation sur ir_obligations',
    not exists(
      select 1 from public.ir_obligations
      where statut_logique = 'TERMINE' and etat_facturation is null
    )
  union all
  select '0054', 'Backfill : aucun TERMINE sans etat_facturation sur caa_obligations',
    not exists(
      select 1 from public.caa_obligations
      where statut_logique = 'TERMINE' and etat_facturation is null
    )
  union all
  select '0054', 'Backfill : aucune livree sans etat_facturation sur missions_exc',
    not exists(
      select 1 from public.missions_exceptionnelles
      where etat_mission = 'livree' and etat_facturation is null
    )
)
select
  mig as migration,
  test,
  case when applied then '✓ OK' else '✗ MANQUE' end as statut
from checks
order by mig, test;
