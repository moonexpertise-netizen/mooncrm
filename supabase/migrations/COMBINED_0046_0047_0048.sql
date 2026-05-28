-- ============================================================================
-- ============================================================================
--
--   MIGRATION COMBINEE : 0046 + 0047 + 0048
--
--   A coller dans SQL Editor Supabase (https://supabase.com/dashboard)
--   puis cliquer sur "Run".
--
--   Toutes les operations sont IDEMPOTENTES :
--     - CREATE TABLE IF NOT EXISTS
--     - ADD COLUMN IF NOT EXISTS
--     - DROP TRIGGER IF EXISTS puis CREATE TRIGGER
--     - DROP POLICY IF EXISTS puis CREATE POLICY
--     - INSERT ... ON CONFLICT DO NOTHING
--
--   => Si une partie est deja appliquee, elle est ignoree. Aucun risque a
--      lancer plusieurs fois.
--
-- ============================================================================
-- ============================================================================


-- ============================================================================
-- ============================================================================
--   MIGRATION 0046 : Missions IR + CAA
-- ============================================================================
-- ============================================================================

-- Relacher le CHECK constraint sur status_options.scope
alter table public.status_options drop constraint if exists status_options_scope_check;
alter table public.status_options add constraint status_options_scope_check
  check (scope in ('obligation', 'onboarding', 'ir', 'caa'));

-- ----------------------------------------------------------------------------
-- IR : clients_ir + ir_obligations
-- ----------------------------------------------------------------------------

create table if not exists public.clients_ir (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  civilite text check (civilite in ('M.', 'Mme', 'Mlle')),
  prenom text,
  nom text not null,
  email text,
  telephone text,
  ldm_statut text default 'a_preparer',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_ir_nom on public.clients_ir(nom);
create index if not exists idx_clients_ir_ldm_statut on public.clients_ir(ldm_statut);

drop trigger if exists trg_clients_ir_updated on public.clients_ir;
create trigger trg_clients_ir_updated
  before update on public.clients_ir
  for each row execute function public.set_updated_at();

create or replace function public.generate_unique_slug_ir(input text, exclude_id uuid default null)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  i int := 1;
begin
  base := public.slugify(input);
  candidate := base;
  while exists (
    select 1 from public.clients_ir
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    i := i + 1;
    candidate := base || '-' || i;
  end loop;
  return candidate;
end;
$$;

create or replace function public.clients_ir_set_slug()
returns trigger
language plpgsql
as $$
declare
  base_text text;
begin
  base_text := coalesce(new.prenom, '') || ' ' || coalesce(new.nom, '');
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_ir(base_text, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.prenom is distinct from old.prenom or new.nom is distinct from old.nom)
       and new.slug is not distinct from old.slug then
      new.slug := public.generate_unique_slug_ir(base_text, new.id);
    end if;
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_ir(base_text, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_ir_set_slug on public.clients_ir;
create trigger trg_clients_ir_set_slug
  before insert or update on public.clients_ir
  for each row execute function public.clients_ir_set_slug();

create table if not exists public.ir_obligations (
  id uuid primary key default gen_random_uuid(),
  client_ir_id uuid not null references public.clients_ir(id) on delete cascade,
  annee int not null,
  type text not null check (type in ('IR', 'IFI')),
  statut_logique text not null default 'A_FAIRE'
    check (statut_logique in ('A_FAIRE', 'EN_COURS', 'TERMINE', 'NON_APPLICABLE')),
  statut_detail text,
  echeance date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_ir_id, annee, type)
);

create index if not exists idx_ir_obligations_client on public.ir_obligations(client_ir_id);
create index if not exists idx_ir_obligations_annee on public.ir_obligations(annee);
create index if not exists idx_ir_obligations_statut on public.ir_obligations(statut_logique);

drop trigger if exists trg_ir_obligations_updated on public.ir_obligations;
create trigger trg_ir_obligations_updated
  before update on public.ir_obligations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- CAA : clients_caa + caa_obligations
-- ----------------------------------------------------------------------------

create table if not exists public.clients_caa (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  denomination text not null,
  siren text,
  forme text,
  dirigeant_nom text,
  dirigeant_email text,
  dirigeant_telephone text,
  ldm_statut text default 'a_preparer',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_caa_denomination on public.clients_caa(denomination);
create index if not exists idx_clients_caa_ldm_statut on public.clients_caa(ldm_statut);

drop trigger if exists trg_clients_caa_updated on public.clients_caa;
create trigger trg_clients_caa_updated
  before update on public.clients_caa
  for each row execute function public.set_updated_at();

create or replace function public.generate_unique_slug_caa(input text, exclude_id uuid default null)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  i int := 1;
begin
  base := public.slugify(input);
  candidate := base;
  while exists (
    select 1 from public.clients_caa
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    i := i + 1;
    candidate := base || '-' || i;
  end loop;
  return candidate;
end;
$$;

create or replace function public.clients_caa_set_slug()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_caa(new.denomination, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.denomination is distinct from old.denomination
       and new.slug is not distinct from old.slug then
      new.slug := public.generate_unique_slug_caa(new.denomination, new.id);
    end if;
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_caa(new.denomination, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_caa_set_slug on public.clients_caa;
create trigger trg_clients_caa_set_slug
  before insert or update on public.clients_caa
  for each row execute function public.clients_caa_set_slug();

create table if not exists public.caa_obligations (
  id uuid primary key default gen_random_uuid(),
  client_caa_id uuid not null references public.clients_caa(id) on delete cascade,
  annee int not null,
  statut_logique text not null default 'A_FAIRE'
    check (statut_logique in ('A_FAIRE', 'EN_COURS', 'TERMINE', 'NON_APPLICABLE')),
  statut_detail text,
  echeance date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_caa_id, annee)
);

create index if not exists idx_caa_obligations_client on public.caa_obligations(client_caa_id);
create index if not exists idx_caa_obligations_annee on public.caa_obligations(annee);
create index if not exists idx_caa_obligations_statut on public.caa_obligations(statut_logique);

drop trigger if exists trg_caa_obligations_updated on public.caa_obligations;
create trigger trg_caa_obligations_updated
  before update on public.caa_obligations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS pour IR/CAA
-- ----------------------------------------------------------------------------

alter table public.clients_ir enable row level security;
alter table public.clients_caa enable row level security;
alter table public.ir_obligations enable row level security;
alter table public.caa_obligations enable row level security;

drop policy if exists p_clients_ir_all on public.clients_ir;
create policy p_clients_ir_all on public.clients_ir
  for all to authenticated using (true) with check (true);
drop policy if exists p_clients_caa_all on public.clients_caa;
create policy p_clients_caa_all on public.clients_caa
  for all to authenticated using (true) with check (true);
drop policy if exists p_ir_obligations_all on public.ir_obligations;
create policy p_ir_obligations_all on public.ir_obligations
  for all to authenticated using (true) with check (true);
drop policy if exists p_caa_obligations_all on public.caa_obligations;
create policy p_caa_obligations_all on public.caa_obligations
  for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Seed status_options pour IR + CAA
-- ----------------------------------------------------------------------------

insert into public.status_options (scope, type_code, libelle, statut_logique, ordre, color, actif) values
  ('ir', 'IR_ANNEE', 'À faire', 'A_FAIRE', 1, null, true),
  ('ir', 'IR_ANNEE', 'En cours', 'EN_COURS', 2, '#3b82f6', true),
  ('ir', 'IR_ANNEE', 'Projet', 'EN_COURS', 3, '#8b5cf6', true),
  ('ir', 'IR_ANNEE', 'EDI - Terminé', 'TERMINE', 4, '#10b981', true),
  ('ir', 'IFI_ANNEE', 'À faire', 'A_FAIRE', 1, null, true),
  ('ir', 'IFI_ANNEE', 'En cours', 'EN_COURS', 2, '#3b82f6', true),
  ('ir', 'IFI_ANNEE', 'Projet', 'EN_COURS', 3, '#8b5cf6', true),
  ('ir', 'IFI_ANNEE', 'EDI - Terminé', 'TERMINE', 4, '#10b981', true),
  ('caa', 'CAA_ANNEE', 'À préparer', 'A_FAIRE', 1, null, true),
  ('caa', 'CAA_ANNEE', 'En cours', 'EN_COURS', 2, '#3b82f6', true),
  ('caa', 'CAA_ANNEE', 'Rapport envoyé', 'TERMINE', 3, '#10b981', true)
on conflict (scope, type_code, libelle) do nothing;


-- ============================================================================
-- ============================================================================
--   MIGRATION 0047 : clients.pipeline_changed_at
-- ============================================================================
-- ============================================================================

alter table public.clients
  add column if not exists pipeline_changed_at timestamptz;

update public.clients
   set pipeline_changed_at = coalesce(updated_at, created_at, now())
 where pipeline_changed_at is null;

create or replace function public.clients_set_pipeline_changed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.pipeline_changed_at is null then
      new.pipeline_changed_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if new.pipeline_statut is distinct from old.pipeline_statut then
      new.pipeline_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_pipeline_changed_at on public.clients;
create trigger trg_clients_pipeline_changed_at
  before insert or update on public.clients
  for each row execute function public.clients_set_pipeline_changed_at();

create index if not exists idx_clients_pipeline_changed_at
  on public.clients (pipeline_statut, pipeline_changed_at desc);


-- ============================================================================
-- ============================================================================
--   MIGRATION 0048 : Missions Exceptionnelles
-- ============================================================================
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table referentiel : types de mission editables
-- ----------------------------------------------------------------------------

create table if not exists public.mission_exc_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  ordre int not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mission_exc_types_actif on public.mission_exc_types(actif);
create index if not exists idx_mission_exc_types_ordre on public.mission_exc_types(ordre);

drop trigger if exists trg_mission_exc_types_updated on public.mission_exc_types;
create trigger trg_mission_exc_types_updated
  before update on public.mission_exc_types
  for each row execute function public.set_updated_at();

create or replace function public.generate_unique_slug_mission_exc_type(input text, exclude_id uuid default null)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  i int := 1;
begin
  base := public.slugify(input);
  if base = '' then base := 'type'; end if;
  candidate := base;
  while exists (
    select 1 from public.mission_exc_types
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    i := i + 1;
    candidate := base || '-' || i;
  end loop;
  return candidate;
end;
$$;

create or replace function public.mission_exc_types_set_slug()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_mission_exc_type(new.label, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.label is distinct from old.label and new.slug is not distinct from old.slug then
      new.slug := public.generate_unique_slug_mission_exc_type(new.label, new.id);
    end if;
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_mission_exc_type(new.label, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mission_exc_types_set_slug on public.mission_exc_types;
create trigger trg_mission_exc_types_set_slug
  before insert or update on public.mission_exc_types
  for each row execute function public.mission_exc_types_set_slug();

-- Seed initial des 8 types les plus courants
insert into public.mission_exc_types (slug, label, ordre, actif) values
  ('transfert-siege',      'Transfert de siège',              10, true),
  ('caa-ponctuel',         'Commissariat aux apports',        20, true),
  ('evaluation',           'Évaluation d''entreprise',        30, true),
  ('attestation',          'Attestation',                     40, true),
  ('ag-extraordinaire',    'AG extraordinaire',               50, true),
  ('audit-ponctuel',       'Audit ponctuel',                  60, true),
  ('modification-statuts', 'Modification de statuts',         70, true),
  ('autre',                'Autre',                           99, true)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Table principale : missions_exceptionnelles
-- ----------------------------------------------------------------------------

create table if not exists public.missions_exceptionnelles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,

  client_id uuid references public.clients(id) on delete set null,
  client_libre text,

  mission text not null,
  type_id uuid references public.mission_exc_types(id) on delete set null,
  description text,

  duree_theorique_h numeric(6,2),
  duree_reelle_h numeric(6,2),
  taux_horaire numeric(10,2),
  forfait numeric(10,2),

  etat_mission text not null default 'a_demarrer'
    check (etat_mission in ('a_demarrer', 'en_cours', 'livree', 'annulee')),
  etat_facturation text not null default 'a_facturer'
    check (etat_facturation in ('a_facturer', 'facturee', 'payee', 'sans_facture')),

  date_debut date,
  date_fin date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mission_exc_client on public.missions_exceptionnelles(client_id);
create index if not exists idx_mission_exc_type on public.missions_exceptionnelles(type_id);
create index if not exists idx_mission_exc_etat_mission on public.missions_exceptionnelles(etat_mission);
create index if not exists idx_mission_exc_etat_facturation on public.missions_exceptionnelles(etat_facturation);
create index if not exists idx_mission_exc_date_debut on public.missions_exceptionnelles(date_debut);

drop trigger if exists trg_missions_exc_updated on public.missions_exceptionnelles;
create trigger trg_missions_exc_updated
  before update on public.missions_exceptionnelles
  for each row execute function public.set_updated_at();

create or replace function public.generate_unique_slug_mission_exc(input text, exclude_id uuid default null)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  i int := 1;
begin
  base := public.slugify(input);
  if base = '' then base := 'mission'; end if;
  candidate := base;
  while exists (
    select 1 from public.missions_exceptionnelles
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    i := i + 1;
    candidate := base || '-' || i;
  end loop;
  return candidate;
end;
$$;

create or replace function public.missions_exc_set_slug()
returns trigger
language plpgsql
as $$
declare
  base_text text;
  client_denom text;
begin
  if new.client_id is not null then
    select denomination into client_denom from public.clients where id = new.client_id;
  end if;
  base_text := coalesce(client_denom, new.client_libre, '') || ' ' || coalesce(new.mission, '');

  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_mission_exc(base_text, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.mission is distinct from old.mission
        or new.client_id is distinct from old.client_id
        or new.client_libre is distinct from old.client_libre)
       and new.slug is not distinct from old.slug then
      new.slug := public.generate_unique_slug_mission_exc(base_text, new.id);
    end if;
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug_mission_exc(base_text, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_missions_exc_set_slug on public.missions_exceptionnelles;
create trigger trg_missions_exc_set_slug
  before insert or update on public.missions_exceptionnelles
  for each row execute function public.missions_exc_set_slug();

-- ----------------------------------------------------------------------------
-- RLS pour missions exceptionnelles
-- ----------------------------------------------------------------------------

alter table public.mission_exc_types enable row level security;
alter table public.missions_exceptionnelles enable row level security;

drop policy if exists p_mission_exc_types_all on public.mission_exc_types;
create policy p_mission_exc_types_all on public.mission_exc_types
  for all to authenticated using (true) with check (true);

drop policy if exists p_missions_exc_all on public.missions_exceptionnelles;
create policy p_missions_exc_all on public.missions_exceptionnelles
  for all to authenticated using (true) with check (true);


-- ============================================================================
--   FIN. Si tout s'est bien passe, tu dois voir "Success. No rows returned"
--   (ou similaire) en bas de l'editeur SQL Supabase.
-- ============================================================================
