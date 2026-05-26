-- ============================================================================
-- Générateur de parcours d'onboarding configurable.
--
-- Avant cette migration, les 13 étapes d'onboarding + leurs règles de
-- création conditionnelles (depot_kbis_banque uniquement pour Création,
-- previ_tns uniquement si gestion_tns=true, etc.) étaient codées en dur
-- dans app/onboarding/actions.ts → taskKeysFor().
--
-- Cette migration introduit 2 tables pour rendre tout ça éditable depuis
-- le CRM :
--   1. onboarding_parcours : un template d'onboarding (nom, description,
--      drapeau is_default pour le parcours appliqué par défaut)
--   2. onboarding_etape : les étapes d'un parcours, avec une liste de
--      conditions de N/A automatique stockées en JSONB
--
-- Quand un client signe sa LDM, initializeOnboardingForClient lit le
-- parcours par défaut + ses étapes + évalue les conditions de N/A vs
-- caractéristiques du client (origine, gestion_tns, forme...) et crée
-- les onboarding_tasks en conséquence (avec statut NON_APPLICABLE si une
-- condition matche, sinon A_FAIRE).
--
-- v1 : un seul parcours par défaut utilisé pour tous les nouveaux dossiers.
-- v2 : possibilité d'affecter un parcours différent par client (cf. note
--      bas de fichier).
-- ============================================================================

-- 1. Étendre onboarding_tasks.task_key (enum → text) pour autoriser des
--    task_keys custom créées via le générateur. L'enum existant ne
--    contient que les 13 keys historiques.
alter table public.onboarding_tasks
  alter column task_key type text using task_key::text;

-- 2. Table des parcours (templates)
create table if not exists public.onboarding_parcours (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Un seul parcours peut être marqué par défaut à la fois.
create unique index if not exists idx_onboarding_parcours_default
  on public.onboarding_parcours(is_default)
  where is_default = true;

comment on column public.onboarding_parcours.is_default is
  'Un seul parcours par défaut à la fois (contrainte index unique partiel). Utilisé par initializeOnboardingForClient quand aucun parcours custom n''est affecté au client.';

-- 3. Table des étapes d'un parcours
create table if not exists public.onboarding_etape (
  id uuid primary key default gen_random_uuid(),
  parcours_id uuid not null references public.onboarding_parcours(id) on delete cascade,
  task_key text not null,
  libelle text not null,
  description text,
  ordre int not null,
  categorie text,
  conditions_na jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Pas de UNIQUE (parcours_id, task_key) : Benjamin peut vouloir 2 étapes
  -- avec le même task_key dans deux parcours différents. Mais 2 fois la
  -- même key dans le même parcours = bug, donc on l'interdit :
  constraint uniq_etape_key_per_parcours unique (parcours_id, task_key)
);

create index if not exists idx_onboarding_etape_parcours_ordre
  on public.onboarding_etape(parcours_id, ordre);

comment on column public.onboarding_etape.conditions_na is
  'Liste de conditions évaluées en OR. Si au moins une matche le client à la création, la tâche est créée en NON_APPLICABLE au lieu de A_FAIRE.

Format JSON :
  [
    {
      "field": "origine" | "gestion_tns" | "forme" | "activite",
      "op":    "eq" | "neq" | "in" | "not_in",
      "value": string | boolean | string[],
      "reason": "Pas applicable aux internes"   // libellé affiché
    },
    ...
  ]

Exemples :
  - {"field":"origine","op":"eq","value":"4 - Interne","reason":"Dossier interne"}
  - {"field":"gestion_tns","op":"eq","value":false,"reason":"Non TNS"}
  - {"field":"forme","op":"in","value":["LMNP","SCI"],"reason":"Forme exclue"}
';

-- 4. RLS : tout user approved peut lire et écrire (conf interne MOON,
--    pas de notion de propriété par utilisateur)
alter table public.onboarding_parcours enable row level security;
alter table public.onboarding_etape enable row level security;

drop policy if exists "approved users full access parcours" on public.onboarding_parcours;
create policy "approved users full access parcours"
  on public.onboarding_parcours for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  );

drop policy if exists "approved users full access etape" on public.onboarding_etape;
create policy "approved users full access etape"
  on public.onboarding_etape for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  );

-- 5. Triggers updated_at
create or replace function public.onboarding_parcours_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_onboarding_parcours_updated_at on public.onboarding_parcours;
create trigger trg_onboarding_parcours_updated_at
  before update on public.onboarding_parcours
  for each row execute function public.onboarding_parcours_touch_updated_at();

create or replace function public.onboarding_etape_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_onboarding_etape_updated_at on public.onboarding_etape;
create trigger trg_onboarding_etape_updated_at
  before update on public.onboarding_etape
  for each row execute function public.onboarding_etape_touch_updated_at();

-- ============================================================================
-- Note v2 : pour affecter un parcours différent par client, ajouter
--   alter table public.clients
--     add column parcours_id uuid references public.onboarding_parcours(id);
-- Et faire le coalesce dans initializeOnboardingForClient :
--   parcours = client.parcours_id ?? parcours_default
-- ============================================================================
