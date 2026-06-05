-- ============================================================================
-- 0067 - Tarif (forfait par defaut) par type de mission exceptionnelle
-- ============================================================================
--
-- Chaque type de mission (Transformation, Transfert de siege, CAA, etc.) a
-- maintenant un tarif par defaut. A la creation d'une mission, le forfait
-- est pre-rempli avec ce tarif. L'utilisateur peut ensuite l'ajuster
-- librement sur la mission specifique.
--
-- "Autre" et autres types sans tarif catalogue restent a 0 par defaut.
--
-- Idempotent.
-- ============================================================================

alter table public.mission_exc_types
  add column if not exists tarif numeric(10, 2) not null default 0
  check (tarif >= 0);

comment on column public.mission_exc_types.tarif is
  'Tarif par defaut (forfait HT) pour les missions de ce type. Pre-remplit '
  'le forfait a la creation d''une mission, modifiable ensuite sur la mission.';
