-- ============================================================================
-- Forfait d'honoraires par annee :
--   - ir_obligations  : 1 forfait par client x annee (commun IR+IFI).
--     On stocke le meme montant sur les lignes IR et IFI pour eviter une table
--     dediee, et on synchronise via setIrForfait (cf. server action).
--   - caa_obligations : 1 forfait par client x annee.
--
-- Idempotent : peut etre rejoue sans risque.
-- ============================================================================

alter table public.ir_obligations
  add column if not exists forfait numeric(10,2);

alter table public.ir_obligations
  drop constraint if exists ir_obligations_forfait_check;
alter table public.ir_obligations
  add constraint ir_obligations_forfait_check
  check (forfait is null or forfait >= 0);

alter table public.caa_obligations
  add column if not exists forfait numeric(10,2);

alter table public.caa_obligations
  drop constraint if exists caa_obligations_forfait_check;
alter table public.caa_obligations
  add constraint caa_obligations_forfait_check
  check (forfait is null or forfait >= 0);
