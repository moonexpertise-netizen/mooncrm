-- Flags supplémentaires pour les phrases LDM (reprise du publipostage Excel).
--
-- type_honos_bilans : 3 états distincts → "Inclus" (forfait_bilan = 0 mais
--   on dit "inclus"), "Facturés" (forfait_bilan = honos_mensuels × 2), null
--   (pas de mention).
-- tdb_periode : Mensuel / Trimestriel / null (= "Pas de souscription").
-- tdb_honos_periode : montant facturé PAR PÉRIODE (peut différer de
--   forfait_pilotage qui est le mensuel normalisé).
--
-- Pour Création / Reprise / Juridique : pas de flag explicite, on dérive
-- du montant > 0.

create type type_honos_bilans_t as enum ('Inclus', 'Facturés');
create type tdb_periode_t as enum ('Mensuel', 'Trimestriel');

alter table public.clients
  add column if not exists type_honos_bilans type_honos_bilans_t,
  add column if not exists tdb_periode tdb_periode_t,
  add column if not exists tdb_honos_periode numeric(10,2) NOT NULL DEFAULT 0;
