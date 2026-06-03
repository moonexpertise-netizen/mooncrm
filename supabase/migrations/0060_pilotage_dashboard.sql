-- ============================================================================
-- Module Pilotage / Dashboard : suivi de production du tableau de bord et des
-- rendez-vous expert pour les dossiers ayant souscrit "Dashboard".
--
-- 2 aspects suivis, chacun avec sa propre cadence (mensuelle ou trimestrielle)
-- definie par client :
--   1. Mise a disposition du tableau de bord  -> type PILOTAGE_TDB
--      Statuts : A preparer / Prepare / Presente
--   2. Realisation du RDV expert              -> type PILOTAGE_RDV
--      Statuts : RDV a planifier / RDV planifie / RDV realise
--
-- Les 2 cadences sont stockees sur clients (config production, ZERO impact LDM).
-- Les obligations sont generees par le moteur (cf. obligations-engine.ts) :
--   - cadence mensuelle    -> 12 instances (1 par mois)
--   - cadence trimestrielle -> 4 instances (mars / juin / sept / dec)
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COLONNES clients : cadence par aspect (NULL = pas encore defini)
-- ----------------------------------------------------------------------------
alter table public.clients
  add column if not exists tdb_livraison_periode text,
  add column if not exists rdv_expert_periode text;

alter table public.clients
  drop constraint if exists clients_tdb_livraison_periode_check;
alter table public.clients
  add constraint clients_tdb_livraison_periode_check
  check (tdb_livraison_periode is null or tdb_livraison_periode in ('Mensuelle', 'Trimestrielle'));

alter table public.clients
  drop constraint if exists clients_rdv_expert_periode_check;
alter table public.clients
  add constraint clients_rdv_expert_periode_check
  check (rdv_expert_periode is null or rdv_expert_periode in ('Mensuel', 'Trimestriel'));

-- ----------------------------------------------------------------------------
-- STATUS_OPTIONS : workflows des 2 nouveaux types d'obligation.
-- Memes colonnes que les autres types (scope='obligation').
-- ----------------------------------------------------------------------------
insert into public.status_options (scope, type_code, libelle, statut_logique, ordre) values
  ('obligation', 'PILOTAGE_TDB', 'À préparer',     'A_FAIRE',         10),
  ('obligation', 'PILOTAGE_TDB', 'Préparé',         'EN_COURS',        20),
  ('obligation', 'PILOTAGE_TDB', 'Présenté',        'TERMINE',         30),
  ('obligation', 'PILOTAGE_TDB', 'N/A',             'NON_APPLICABLE',  90),
  ('obligation', 'PILOTAGE_RDV', 'RDV à planifier', 'A_FAIRE',         10),
  ('obligation', 'PILOTAGE_RDV', 'RDV planifié',    'EN_COURS',        20),
  ('obligation', 'PILOTAGE_RDV', 'RDV réalisé',     'TERMINE',         30),
  ('obligation', 'PILOTAGE_RDV', 'N/A',             'NON_APPLICABLE',  90)
on conflict (scope, type_code, libelle) do nothing;
