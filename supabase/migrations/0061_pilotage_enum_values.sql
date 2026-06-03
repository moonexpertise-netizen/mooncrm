-- ============================================================================
-- Fix migration 0060 : etend l'enum type_obligation pour accepter les 2
-- nouveaux types PILOTAGE_TDB et PILOTAGE_RDV.
--
-- Sans cette migration, l'INSERT dans obligation_subscriptions avec
-- type='PILOTAGE_TDB' (ou RDV) echoue avec :
--   invalid input value for enum type_obligation: "PILOTAGE_TDB"
-- -> error boundary cote UI quand on toggle Dashboard.
--
-- ALTER TYPE ADD VALUE est idempotent grace au IF NOT EXISTS (Postgres 14+).
-- ============================================================================

alter type public.type_obligation add value if not exists 'PILOTAGE_TDB';
alter type public.type_obligation add value if not exists 'PILOTAGE_RDV';
