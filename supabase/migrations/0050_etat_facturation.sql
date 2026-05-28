-- ============================================================================
-- Ajoute etat_facturation sur :
--   - obligations           (pour le suivi facturation juridique sur AGO)
--   - ir_obligations        (1 par client x annee x type IR/IFI)
--   - caa_obligations       (1 par client x annee)
--
-- Valeurs : 'a_facturer' / 'facturee' / 'payee' / 'sans_facture'
-- NULL = pas encore decide / pas applicable.
--
-- Idempotent : peut etre rejoue sans risque.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. obligations (pour AGO_DEPOT et potentiellement d'autres types plus tard)
-- ----------------------------------------------------------------------------

alter table public.obligations
  add column if not exists etat_facturation text;

alter table public.obligations
  drop constraint if exists obligations_etat_facturation_check;
alter table public.obligations
  add constraint obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'payee', 'sans_facture'));

create index if not exists idx_obligations_etat_facturation
  on public.obligations(etat_facturation)
  where etat_facturation is not null;

-- ----------------------------------------------------------------------------
-- 2. ir_obligations (un statut facturation par client x annee x type)
-- ----------------------------------------------------------------------------

alter table public.ir_obligations
  add column if not exists etat_facturation text;

alter table public.ir_obligations
  drop constraint if exists ir_obligations_etat_facturation_check;
alter table public.ir_obligations
  add constraint ir_obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'payee', 'sans_facture'));

create index if not exists idx_ir_obligations_etat_facturation
  on public.ir_obligations(etat_facturation)
  where etat_facturation is not null;

-- ----------------------------------------------------------------------------
-- 3. caa_obligations
-- ----------------------------------------------------------------------------

alter table public.caa_obligations
  add column if not exists etat_facturation text;

alter table public.caa_obligations
  drop constraint if exists caa_obligations_etat_facturation_check;
alter table public.caa_obligations
  add constraint caa_obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'payee', 'sans_facture'));

create index if not exists idx_caa_obligations_etat_facturation
  on public.caa_obligations(etat_facturation)
  where etat_facturation is not null;
