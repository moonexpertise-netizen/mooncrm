-- ============================================================================
-- MoonCRM — schéma initial (Phase 1)
-- Modèle relationnel : abonnements obligation × exercice + instances générées.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

create type forme_juridique as enum (
  'ASSO','SA','SCI','EI','SARL','SAS','SELARL','SELAS',
  'SCM','SC','EURL','SASU','INDIV','AARPI','LMNP'
);

create type activite as enum (
  'STARTUP','COMMERCE','FORMATION','HOLDING','LMNP','INFLUENCEUR',
  'COACHING SPORTIF','ARCHITECTE','SANTE','ENERGIES','CONSULTANT',
  'E-COMMERCE','PHOTOGRAPHE','ARTISAN','AVOCAT'
);

create type origine as enum (
  '1 - Création',
  '2 - Création par Tiers',
  '3 - Reprise',
  '4 - Reprise sans EC',
  'Z - Sous-traitance'
);

create type regime as enum ('IR','IS');

-- Pipeline tel qu'il existe réellement dans la base (extrait du CSV)
create type pipeline_statut as enum (
  '1 - PC Préparée',
  '5 - LDM Envoyée',
  '6 - LDM Signée',
  'Z - Interne',
  'Z - Prospect perdu',
  'Z - Résiliée'
);

create type vitesse_tva as enum (
  '1 - Express',
  '2 - Traitement + long',
  '3 - Tableau de bord'
);

-- Types d'obligations. La fréquence est encodée dans le type pour la TVA et la TVS
-- (TVA_MENSUELLE vs TVA_TRIMESTRIELLE vs TVA_ANNUELLE_CA12 vs TVA_NON_SOUMIS).
create type type_obligation as enum (
  -- TVA
  'TVA_MENSUELLE','TVA_TRIMESTRIELLE','TVA_ANNUELLE_CA12','TVA_NON_SOUMIS',
  -- TVS
  'TVS_MENSUELLE','TVS_TRIMESTRIELLE',
  -- IS
  'IS_ACOMPTE','IS_SOLDE',
  -- CVAE
  'CVAE','CVAE_ACOMPTE',
  -- Locaux
  'CFE',
  -- Déclarations annuelles/spécifiques
  'DAS2','DECL_2561','DECL_2777','OSS','DES',
  -- Mission cabinet
  'COMPTA','LIASSE_PLAQUETTE','AGO_DEPOT','DEPOT_COMPTES',
  -- Facturation juridique
  'FACTURATION_JUR',
  -- État de la société (immatriculation, KBIS)
  'ETAT_CREATION'
);

-- Statut logique fini, utilisé pour les filtres et dashboards
create type statut_logique as enum (
  'A_FAIRE','EN_COURS','TERMINE','NON_APPLICABLE'
);

-- Clés des tâches d'onboarding (one-shot par client)
create type onboarding_task_key as enum (
  -- 2G - Admin général
  'tally_crea_pdc','abo_moon','mandat_moon','mandat_impots','impot_gouv',
  'cfe_1447','acces_pennylane','ob_pennylane',
  -- 2C - Création
  'depot_kbis_banque',
  -- 2R - Reprise
  'confrere','reprise_compta',
  -- 2T - TNS
  'affiliation_tns','option_ir_is','previ_tns'
);

create type onboarding_categorie as enum ('2G','2C','2R','2T');

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

-- Profil utilisateur lié à auth.users (Supabase)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nom text,
  created_at timestamptz not null default now()
);

create table public.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text,
  telephone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fiche client. Pas de flag d'obligation ici : tout est dans obligation_subscriptions.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  denomination text not null,
  siren text,
  pappers_url text,
  inpi_url text,
  forme forme_juridique,
  activite activite,
  email text,
  origine origine,
  regime regime,
  -- Clôture standard récurrente (JJ/MM)
  jour_cloture smallint check (jour_cloture between 1 and 31),
  mois_cloture smallint check (mois_cloture between 1 and 12),
  -- Première clôture si non standard (premier exercice prolongé/raccourci)
  premiere_cloture date,
  mois_signature date,
  collaborateur_id uuid references public.users(id),
  groupe_id uuid references public.groupes(id),
  pipeline_statut pipeline_statut,
  vitesse_tva vitesse_tva,
  creation_sous_moon smallint,
  note_pdc text,
  ldm_social text,
  mrr numeric(10,2) not null default 0,
  arr numeric(10,2) generated always as (mrr * 12) stored,
  honoraires_compta numeric(10,2) not null default 0,
  honoraires_jur numeric(10,2) not null default 0,
  exceptionnel numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_clients_pipeline on public.clients(pipeline_statut);
create index idx_clients_collab on public.clients(collaborateur_id);
create index idx_clients_groupe on public.clients(groupe_id);
create index idx_clients_origine on public.clients(origine);
create index idx_clients_forme on public.clients(forme);

-- Liaison client <-> contact (un client peut avoir plusieurs interlocuteurs)
create table public.client_contacts (
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text,
  primary key (client_id, contact_id)
);

-- Tâches d'onboarding (une seule par (client, task_key))
create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  task_key onboarding_task_key not null,
  categorie onboarding_categorie not null,
  statut_logique statut_logique not null default 'A_FAIRE',
  statut_detail text,
  note text,
  updated_at timestamptz not null default now(),
  unique (client_id, task_key)
);
create index idx_onboarding_client on public.onboarding_tasks(client_id);

-- ABONNEMENTS — le cœur du modèle.
-- 1 ligne ici = "ce client a cette obligation pour cette année (exercice)".
-- À partir des abonnements, le moteur génère les instances dans `obligations`.
create table public.obligation_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type type_obligation not null,
  annee smallint not null,
  note text,
  created_at timestamptz not null default now(),
  unique (client_id, type, annee)
);
create index idx_subs_client on public.obligation_subscriptions(client_id);
create index idx_subs_annee on public.obligation_subscriptions(annee);
create index idx_subs_type_annee on public.obligation_subscriptions(type, annee);

-- INSTANCES d'obligations — générées par le moteur depuis les abonnements.
-- 1 ligne par échéance concrète (ex : TVA janv 2026, acompte IS 15 mars 2026).
create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.obligation_subscriptions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  type type_obligation not null,
  periode text not null,                -- "2026-01" / "T1-2026" / "2025"
  annee smallint not null,
  echeance date,
  statut_logique statut_logique not null default 'A_FAIRE',
  statut_detail text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, periode)
);
create index idx_obl_client on public.obligations(client_id);
create index idx_obl_echeance on public.obligations(echeance);
create index idx_obl_statut on public.obligations(statut_logique);
create index idx_obl_type_annee on public.obligations(type, annee);

-- Catalogue des libellés "statut détail" autorisés par type / scope.
-- Permet d'ajouter de nouveaux libellés métier sans migration de schéma.
create table public.status_options (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('obligation','onboarding')),
  type_code text not null,                  -- ex 'CFE', 'COMPTA', 'mandat_impots'
  libelle text not null,                    -- ex "Pas d'avis", "PRLV échéance"
  statut_logique statut_logique not null,
  ordre smallint not null default 0,
  actif boolean not null default true,
  unique (scope, type_code, libelle)
);
create index idx_status_options_scope_type on public.status_options(scope, type_code);

-- ----------------------------------------------------------------------------
-- TRIGGERS — updated_at automatique
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_updated
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger trg_contacts_updated
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger trg_onboarding_updated
  before update on public.onboarding_tasks
  for each row execute function public.set_updated_at();

create trigger trg_obligations_updated
  before update on public.obligations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Politique de départ : tout utilisateur authentifié a tous les droits.
-- À raffiner quand on aura des collaborateurs avec rôles différenciés.

alter table public.users                    enable row level security;
alter table public.groupes                  enable row level security;
alter table public.contacts                 enable row level security;
alter table public.clients                  enable row level security;
alter table public.client_contacts          enable row level security;
alter table public.onboarding_tasks         enable row level security;
alter table public.obligation_subscriptions enable row level security;
alter table public.obligations              enable row level security;
alter table public.status_options           enable row level security;

create policy p_users_self_read on public.users
  for select to authenticated using (auth.uid() = id);
create policy p_users_self_update on public.users
  for update to authenticated using (auth.uid() = id);

create policy p_groupes_all on public.groupes
  for all to authenticated using (true) with check (true);
create policy p_contacts_all on public.contacts
  for all to authenticated using (true) with check (true);
create policy p_clients_all on public.clients
  for all to authenticated using (true) with check (true);
create policy p_client_contacts_all on public.client_contacts
  for all to authenticated using (true) with check (true);
create policy p_onboarding_all on public.onboarding_tasks
  for all to authenticated using (true) with check (true);
create policy p_subs_all on public.obligation_subscriptions
  for all to authenticated using (true) with check (true);
create policy p_obligations_all on public.obligations
  for all to authenticated using (true) with check (true);
create policy p_status_options_read on public.status_options
  for select to authenticated using (true);
create policy p_status_options_write on public.status_options
  for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Auto-création du profil public.users à la création d'un user auth.users
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
