-- ============================================================================
-- Pilotage : cadences (TdB livraison, RDV expert) par ANNEE, pas par client.
--
-- Avant : clients.tdb_livraison_periode + clients.rdv_expert_periode (1 valeur
--         pour toute la vie du dossier).
-- Apres : client_year_config.tdb_livraison_periode + rdv_expert_periode
--         (1 valeur par exercice fiscal). Permet a un client de passer
--         mensuel -> trimestriel d'une annee a l'autre.
--
-- On NE SUPPRIME PAS les colonnes existantes sur clients (= fallback /
-- "valeur par defaut" si pas de config pour une annee donnee). On peut les
-- droper plus tard si plus utilisees.
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COLONNES sur client_year_config
-- ----------------------------------------------------------------------------
alter table public.client_year_config
  add column if not exists tdb_livraison_periode text,
  add column if not exists rdv_expert_periode text;

alter table public.client_year_config
  drop constraint if exists client_year_config_tdb_livraison_periode_check;
alter table public.client_year_config
  add constraint client_year_config_tdb_livraison_periode_check
  check (tdb_livraison_periode is null or tdb_livraison_periode in ('Mensuelle', 'Trimestrielle'));

alter table public.client_year_config
  drop constraint if exists client_year_config_rdv_expert_periode_check;
alter table public.client_year_config
  add constraint client_year_config_rdv_expert_periode_check
  check (rdv_expert_periode is null or rdv_expert_periode in ('Mensuel', 'Trimestriel'));

-- ----------------------------------------------------------------------------
-- BACKFILL : pour chaque (client, annee) ayant deja des obligations pilotage,
-- on copie la valeur clients.tdb_livraison_periode / rdv_expert_periode dans
-- client_year_config si elle n'y est pas deja definie.
-- ----------------------------------------------------------------------------
insert into public.client_year_config (client_id, annee, tdb_livraison_periode, rdv_expert_periode)
select
  po.client_id,
  po.annee,
  c.tdb_livraison_periode,
  c.rdv_expert_periode
from public.pilotage_obligations po
join public.clients c on c.id = po.client_id
group by po.client_id, po.annee, c.tdb_livraison_periode, c.rdv_expert_periode
on conflict (client_id, annee) do update
  set
    tdb_livraison_periode = coalesce(public.client_year_config.tdb_livraison_periode, excluded.tdb_livraison_periode),
    rdv_expert_periode    = coalesce(public.client_year_config.rdv_expert_periode,    excluded.rdv_expert_periode);
