-- ============================================================================
-- Supprime le statut "payee" de etat_facturation : "facturee" devient le
-- statut terminal. La logique metier devient :
--   - a_facturer  : la facturation est due
--   - facturee    : la facturation est emise (= terminé pour la production)
--   - sans_facture: pas de facturation prevue
--
-- Migration en 2 temps :
--   1. Backfill : les rows en 'payee' passent en 'facturee'
--   2. Relacher puis remettre la contrainte CHECK sans 'payee'
--
-- Idempotent : peut etre rejoue sans risque.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. obligations
-- ----------------------------------------------------------------------------

update public.obligations
   set etat_facturation = 'facturee'
 where etat_facturation = 'payee';

alter table public.obligations
  drop constraint if exists obligations_etat_facturation_check;
alter table public.obligations
  add constraint obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'sans_facture'));

-- ----------------------------------------------------------------------------
-- 2. ir_obligations
-- ----------------------------------------------------------------------------

update public.ir_obligations
   set etat_facturation = 'facturee'
 where etat_facturation = 'payee';

alter table public.ir_obligations
  drop constraint if exists ir_obligations_etat_facturation_check;
alter table public.ir_obligations
  add constraint ir_obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'sans_facture'));

-- ----------------------------------------------------------------------------
-- 3. caa_obligations
-- ----------------------------------------------------------------------------

update public.caa_obligations
   set etat_facturation = 'facturee'
 where etat_facturation = 'payee';

alter table public.caa_obligations
  drop constraint if exists caa_obligations_etat_facturation_check;
alter table public.caa_obligations
  add constraint caa_obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'sans_facture'));

-- ----------------------------------------------------------------------------
-- 4. missions_exceptionnelles (etat_facturation NOT NULL avec default)
-- ----------------------------------------------------------------------------

update public.missions_exceptionnelles
   set etat_facturation = 'facturee'
 where etat_facturation = 'payee';

alter table public.missions_exceptionnelles
  drop constraint if exists missions_exceptionnelles_etat_facturation_check;
alter table public.missions_exceptionnelles
  add constraint missions_exceptionnelles_etat_facturation_check
  check (etat_facturation in ('a_facturer', 'facturee', 'sans_facture'));
