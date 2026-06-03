-- ============================================================================
-- Module Pilotage / Dashboard : suivi de production du tableau de bord et des
-- rendez-vous expert.
--
-- IMPORTANT : ce module est volontairement ISOLE de la table `obligations` et
-- de l'enum `type_obligation`. Pattern : meme architecture que ir_obligations
-- / caa_obligations (table dediee + type text en CHECK constraint, pas enum).
-- Ca evite les cascades de bugs sur les tables/enums existants.
--
-- 2 aspects suivis avec leur propre cadence (par client) :
--   TDB : Mise a disposition tableau de bord
--         Statuts : A preparer / Prepare / Presente
--   RDV : RDV Expert
--         Statuts : RDV a planifier / RDV planifie / RDV realise
--
-- Cadences : Mensuelle/Trimestrielle (TDB), Mensuel/Trimestriel (RDV)
-- Periode  : YYYY-MM dans les 2 cas (12 lignes/an mensuel, 4 lignes/an trim.)
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COLONNES clients : cadence par aspect (NULL = pas encore defini, defaut UI = mensuel)
-- Idempotent : ne fait rien si la migration 0060 a deja ajoute ces colonnes.
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
-- TABLE pilotage_obligations : 1 ligne = 1 obligation pour (client, annee, type, periode)
-- ----------------------------------------------------------------------------
create table if not exists public.pilotage_obligations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  annee int not null,
  type text not null check (type in ('TDB', 'RDV')),
  periode text not null,                 -- 'YYYY-MM'
  statut_logique text not null default 'A_FAIRE'
    check (statut_logique in ('A_FAIRE', 'EN_COURS', 'TERMINE', 'NON_APPLICABLE')),
  statut_detail text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, annee, type, periode)
);

create index if not exists idx_pilotage_oblig_client on public.pilotage_obligations(client_id);
create index if not exists idx_pilotage_oblig_annee on public.pilotage_obligations(annee);
create index if not exists idx_pilotage_oblig_type on public.pilotage_obligations(type);
create index if not exists idx_pilotage_oblig_statut on public.pilotage_obligations(statut_logique);

-- Trigger updated_at (reutilise la fonction set_updated_at existante depuis 0001)
drop trigger if exists trg_pilotage_obligations_updated on public.pilotage_obligations;
create trigger trg_pilotage_obligations_updated
  before update on public.pilotage_obligations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS : tout user authentifie peut lire/ecrire (meme pattern qu'IR/CAA)
-- ----------------------------------------------------------------------------
alter table public.pilotage_obligations enable row level security;

drop policy if exists p_pilotage_obligations_all on public.pilotage_obligations;
create policy p_pilotage_obligations_all on public.pilotage_obligations
  for all to authenticated using (true) with check (true);
