-- ============================================================================
-- Missions Exceptionnelles (mission_exc)
--
-- Module distinct des trackers Production : sert a tracker tout ce qui n'est
-- PAS recurrent dans le cabinet :
--   - Transferts de siege
--   - Commissariats aux apports (CAA est aussi un module a part pour le suivi
--     LDM par annee, mais on peut tracker ici les CAA ponctuelles aussi)
--   - Evaluations d'entreprise
--   - Attestations diverses
--   - Assemblees Generales extraordinaires
--   - Audits ponctuels
--   - etc.
--
-- Modele :
--   - mission_exc_types  : referentiel editable des types (pas un enum dur).
--     Beneficie le filtrage et la coherence des libelles sans bloquer Benjamin
--     quand il rencontre un nouveau type.
--   - missions_exceptionnelles : 1 ligne = 1 mission. Client soit lie a un
--     client EC existant (client_id), soit libre texte (client_libre) pour
--     les prospects/contacts hors CRM.
--
-- Champs metiers :
--   - duree_theorique_h / duree_reelle_h  : heures
--   - taux_horaire / forfait              : montant EUR
--   - etat_mission     : 'a_demarrer' / 'en_cours' / 'livree' / 'annulee'
--   - etat_facturation : 'a_facturer' / 'facturee' / 'payee' / 'sans_facture'
-- ============================================================================

-- ============================================================================
-- 1. Table referentiel : types de mission editables
-- ============================================================================

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

-- Auto-slug pour types
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

-- Seed initial : types les plus courants. ON CONFLICT par slug evite les doublons
-- si la migration est rejouee.
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

-- ============================================================================
-- 2. Table principale : missions_exceptionnelles
-- ============================================================================

create table if not exists public.missions_exceptionnelles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,

  -- Client : soit reference vers public.clients (EC existant), soit libre.
  -- L'un OU l'autre, jamais les deux requis. On accepte les deux NULL au
  -- demarrage (Benjamin saisit progressivement).
  client_id uuid references public.clients(id) on delete set null,
  client_libre text,

  -- Identite de la mission
  mission text not null,
  type_id uuid references public.mission_exc_types(id) on delete set null,
  description text,

  -- Volumetrie + tarif
  duree_theorique_h numeric(6,2),
  duree_reelle_h numeric(6,2),
  taux_horaire numeric(10,2),
  forfait numeric(10,2),

  -- Etats : mission (avancement) + facturation
  etat_mission text not null default 'a_demarrer'
    check (etat_mission in ('a_demarrer', 'en_cours', 'livree', 'annulee')),
  etat_facturation text not null default 'a_facturer'
    check (etat_facturation in ('a_facturer', 'facturee', 'payee', 'sans_facture')),

  -- Dates
  date_debut date,
  date_fin date,

  -- Audit
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

-- Auto-slug : base sur la denomination du client + le label mission
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
  -- Si on a un client_id, on recupere sa denomination, sinon on prend client_libre.
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

-- ============================================================================
-- 3. RLS
-- ============================================================================

alter table public.mission_exc_types enable row level security;
alter table public.missions_exceptionnelles enable row level security;

drop policy if exists p_mission_exc_types_all on public.mission_exc_types;
create policy p_mission_exc_types_all on public.mission_exc_types
  for all to authenticated using (true) with check (true);

drop policy if exists p_missions_exc_all on public.missions_exceptionnelles;
create policy p_missions_exc_all on public.missions_exceptionnelles
  for all to authenticated using (true) with check (true);
