-- ============================================================================
-- Saisie des temps (timesheets) — V1.
--
-- Objectif : rattacher le temps passé à un DOSSIER COMPTABLE (client) + un
-- exercice, pour calculer la rentabilité (taux effectif = honoraires ÷ heures).
-- Règle métier (Benjamin) : on ne saisit du temps que sur un dossier comptable ;
-- sinon on choisit « Autre » + un commentaire obligatoire.
--
-- 2 tables :
--   - time_activites : nature du travail (paramétrable, comme status_options)
--   - time_entries   : une ligne = un temps saisi par un collaborateur
--
-- Modèle de confiance aligné sur le reste du CRM (cf. obligation_comments) :
-- tout utilisateur approuvé LIT les temps (CRM interne, transparence + besoin
-- pour la rentabilité par dossier), mais n'ÉCRIT/édite QUE les siens.
-- ============================================================================

-- ----- Activités (nature du travail) -----------------------------------------
create table if not exists public.time_activites (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,
  ordre int not null default 100,
  actif boolean not null default true,
  facturable_defaut boolean not null default true
);

alter table public.time_activites enable row level security;

drop policy if exists "time_activites readable" on public.time_activites;
create policy "time_activites readable"
  on public.time_activites for select
  using (auth.uid() is not null);

drop policy if exists "time_activites admin write" on public.time_activites;
create policy "time_activites admin write"
  on public.time_activites for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Seed des activités par défaut (idempotent via unique(libelle)).
insert into public.time_activites (libelle, ordre, facturable_defaut) values
  ('Tenue / saisie', 10, true),
  ('Révision',       20, true),
  ('TVA',            30, true),
  ('Bilan / liasse', 40, true),
  ('IS',             50, true),
  ('Social / paie',  60, true),
  ('Conseil / RDV',  70, true),
  ('Juridique',      80, true),
  ('Relances',       90, true)
on conflict (libelle) do nothing;

-- ----- Saisies de temps ------------------------------------------------------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Dossier comptable rattaché. NULL = travail « Autre » (hors dossier).
  client_id uuid references public.clients(id) on delete cascade,
  -- Catégorie quand client_id est NULL (Interne, Commercial, Formation...).
  categorie_autre text,
  -- Nature du travail (NULL toléré, ex. pour « Autre »).
  activite_id uuid references public.time_activites(id) on delete set null,
  date_jour date not null,
  duree_minutes int not null check (duree_minutes > 0 and duree_minutes <= 1440),
  -- Exercice de rattachement (= année du forfait visé). Souvent year(date_jour).
  annee int not null,
  commentaire text,
  facturable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- LA règle métier, garantie en base : soit un dossier, soit Autre+commentaire.
  constraint time_entry_dossier_ou_autre check (
    client_id is not null
    or (categorie_autre is not null and commentaire is not null and length(trim(commentaire)) > 0)
  )
);

create index if not exists idx_time_entries_user_date
  on public.time_entries(user_id, date_jour desc);
create index if not exists idx_time_entries_client_annee
  on public.time_entries(client_id, annee);
create index if not exists idx_time_entries_annee
  on public.time_entries(annee);

alter table public.time_entries enable row level security;

-- Lecture : tout utilisateur approuvé (besoin pour la rentabilité par dossier).
drop policy if exists "time_entries read approved" on public.time_entries;
create policy "time_entries read approved"
  on public.time_entries for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true));

-- Insertion : chacun ne crée QUE ses propres lignes.
drop policy if exists "time_entries insert own" on public.time_entries;
create policy "time_entries insert own"
  on public.time_entries for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
  );

drop policy if exists "time_entries update own" on public.time_entries;
create policy "time_entries update own"
  on public.time_entries for update
  using (user_id = auth.uid());

drop policy if exists "time_entries delete own" on public.time_entries;
create policy "time_entries delete own"
  on public.time_entries for delete
  using (user_id = auth.uid());

-- Trigger updated_at
create or replace function public.time_entries_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_time_entries_updated_at on public.time_entries;
create trigger trg_time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.time_entries_touch_updated_at();

-- ----- Permissions (matrice éditable role_permissions) -----------------------
-- saisir_temps : saisir ses propres temps (admin + collaborateur).
-- voir_temps_equipe : voir les temps des autres + rentabilité (admin).
-- L'admin a TOUT par définition (effectivePermissions), mais on seed par
-- cohérence avec la migration 0079.
insert into public.role_permissions (role, permission) values
  ('admin', 'saisir_temps'),
  ('admin', 'voir_temps_equipe'),
  ('collaborateur', 'saisir_temps')
on conflict (role, permission) do nothing;
