-- ============================================================================
-- Ajoute le statut LDM (Lettre de mission) sur missions_exceptionnelles.
--
-- Valeurs :
--   - a_faire  : LDM a preparer (defaut)
--   - na       : pas de LDM necessaire pour cette mission
--   - envoyee  : LDM envoyee en signature au client
--   - signee   : LDM signee par le client
--
-- Idempotent : peut etre rejoue sans risque.
-- ============================================================================

alter table public.missions_exceptionnelles
  add column if not exists ldm_statut text not null default 'a_faire';

-- Relacher puis remettre la contrainte CHECK pour autoriser les 4 valeurs
alter table public.missions_exceptionnelles
  drop constraint if exists missions_exceptionnelles_ldm_statut_check;
alter table public.missions_exceptionnelles
  add constraint missions_exceptionnelles_ldm_statut_check
  check (ldm_statut in ('a_faire', 'na', 'envoyee', 'signee'));

create index if not exists idx_mission_exc_ldm_statut
  on public.missions_exceptionnelles(ldm_statut);
