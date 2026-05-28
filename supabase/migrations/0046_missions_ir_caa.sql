-- ============================================================================
-- Missions IR (Impôts sur le Revenu) + CAA (Commissaire aux Apports)
--
-- Deux nouveaux types de missions, distincts des clients d'expertise comptable :
--   - IR  : personnes physiques (declarations IR et IFI annuelles)
--   - CAA : personnes morales SPECIFIQUES (missions ponctuelles, pas EC)
--
-- Choix d'archi (decide avec Benjamin) :
--   - Tables completement separees (clients_ir, clients_caa) — pas de melange
--     avec public.clients (qui reste reserve a l'expertise comptable).
--   - Trackers Production-like : 1 entree par client-annee-type, avec
--     statut_logique + statut_detail, exactement comme obligations.
--   - status_options scope 'ir' / 'caa' pour les libelles de statut, pour
--     beneficier du systeme de couleurs existant.
-- ============================================================================

-- ============================================================================
-- IR : clients_ir + ir_obligations
-- ============================================================================

create table public.clients_ir (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  -- Identite personne physique
  civilite text check (civilite in ('M.', 'Mme', 'Mlle')),
  prenom text,
  nom text not null,
  email text,
  telephone text,
  -- Statut LDM commercial (mini-pipeline pour les missions hors EC).
  -- Les libelles exacts seront seedes dans une migration ulterieure quand
  -- Benjamin nous donnera la liste complete (a_preparer / propale_acceptee /
  -- ldm_envoyee / ldm_signee).
  ldm_statut text default 'a_preparer',
  -- Note libre (interne)
  note text,
  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_ir_nom on public.clients_ir(nom);
create index idx_clients_ir_ldm_statut on public.clients_ir(ldm_statut);

-- Trigger updated_at
create trigger trg_clients_ir_updated
  before update on public.clients_ir
  for each row execute function public.set_updated_at();

-- Trigger slug auto-genere (suit le pattern de clients : prenom + nom)
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

-- Utilise la fonction slugify() deja definie dans migration 0035
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

create trigger trg_clients_ir_set_slug
  before insert or update on public.clients_ir
  for each row execute function public.clients_ir_set_slug();

-- Dossiers IR / IFI par annee. 1 ligne = 1 obligation pour un client une annee.
-- type : 'IR' ou 'IFI' (deux obligations distinctes, peuvent coexister).
create table public.ir_obligations (
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

create index idx_ir_obligations_client on public.ir_obligations(client_ir_id);
create index idx_ir_obligations_annee on public.ir_obligations(annee);
create index idx_ir_obligations_statut on public.ir_obligations(statut_logique);

create trigger trg_ir_obligations_updated
  before update on public.ir_obligations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- CAA : clients_caa + caa_obligations
-- ============================================================================

create table public.clients_caa (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  -- Identite personne morale
  denomination text not null,
  siren text,
  forme text,
  -- Contact dirigeant (texte libre, pas de table contacts ici pour rester simple)
  dirigeant_nom text,
  dirigeant_email text,
  dirigeant_telephone text,
  -- Statut LDM (meme mini-pipeline qu'IR)
  ldm_statut text default 'a_preparer',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_caa_denomination on public.clients_caa(denomination);
create index idx_clients_caa_ldm_statut on public.clients_caa(ldm_statut);

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

create trigger trg_clients_caa_set_slug
  before insert or update on public.clients_caa
  for each row execute function public.clients_caa_set_slug();

-- Dossier CAA par annee : 1 mission CAA par annee maximum (mission ponctuelle).
create table public.caa_obligations (
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

create index idx_caa_obligations_client on public.caa_obligations(client_caa_id);
create index idx_caa_obligations_annee on public.caa_obligations(annee);
create index idx_caa_obligations_statut on public.caa_obligations(statut_logique);

create trigger trg_caa_obligations_updated
  before update on public.caa_obligations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS : tout user authentifie peut lire/ecrire (memes regles que clients)
-- ============================================================================

alter table public.clients_ir enable row level security;
alter table public.clients_caa enable row level security;
alter table public.ir_obligations enable row level security;
alter table public.caa_obligations enable row level security;

create policy p_clients_ir_all on public.clients_ir
  for all to authenticated using (true) with check (true);
create policy p_clients_caa_all on public.clients_caa
  for all to authenticated using (true) with check (true);
create policy p_ir_obligations_all on public.ir_obligations
  for all to authenticated using (true) with check (true);
create policy p_caa_obligations_all on public.caa_obligations
  for all to authenticated using (true) with check (true);

-- ============================================================================
-- Seed status_options pour scopes 'ir' et 'caa'
--
-- Pour IR : 4 statuts par type (IR / IFI) — "A faire", "En cours", "Projet",
-- "EDI - Termine". Les statuts EDI et Termine vont sur le bucket TERMINE.
-- Pour CAA : 3 statuts — "A preparer", "En cours", "Rapport envoye".
-- ============================================================================

insert into public.status_options (scope, type_code, libelle, statut_logique, ordre, color, actif) values
  -- IR sur l'annee
  ('ir', 'IR_ANNEE', 'À faire', 'A_FAIRE', 1, null, true),
  ('ir', 'IR_ANNEE', 'En cours', 'EN_COURS', 2, '#3b82f6', true),
  ('ir', 'IR_ANNEE', 'Projet', 'EN_COURS', 3, '#8b5cf6', true),
  ('ir', 'IR_ANNEE', 'EDI - Terminé', 'TERMINE', 4, '#10b981', true),
  -- IFI sur l'annee (memes statuts)
  ('ir', 'IFI_ANNEE', 'À faire', 'A_FAIRE', 1, null, true),
  ('ir', 'IFI_ANNEE', 'En cours', 'EN_COURS', 2, '#3b82f6', true),
  ('ir', 'IFI_ANNEE', 'Projet', 'EN_COURS', 3, '#8b5cf6', true),
  ('ir', 'IFI_ANNEE', 'EDI - Terminé', 'TERMINE', 4, '#10b981', true),
  -- CAA sur l'annee
  ('caa', 'CAA_ANNEE', 'À préparer', 'A_FAIRE', 1, null, true),
  ('caa', 'CAA_ANNEE', 'En cours', 'EN_COURS', 2, '#3b82f6', true),
  ('caa', 'CAA_ANNEE', 'Rapport envoyé', 'TERMINE', 3, '#10b981', true)
on conflict (scope, type_code, libelle) do nothing;
