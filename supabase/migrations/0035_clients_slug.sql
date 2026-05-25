-- ============================================================================
-- Ajout d'un `slug` lisible sur clients (ex. "adelex-consulting") pour
-- remplacer l'UUID dans l'URL : /clients/4fa4414a-... → /clients/adelex-consulting
--
-- Le slug est auto-généré depuis la denomination (NFD strip accents, kebab-case,
-- truncation à 50 chars, suffixe -2/-3/... si collision). Trigger sur INSERT
-- et sur UPDATE de denomination (le slug suit le renommage du dossier).
-- ============================================================================

create extension if not exists unaccent;

-- Slugify : "Adelex Consulting" → "adelex-consulting", garde [a-z0-9-]
create or replace function public.slugify(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  if input is null then return null; end if;
  s := lower(unaccent(input));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '(^-+|-+$)', '', 'g');
  s := left(s, 60);
  if s = '' then s := 'client'; end if;
  return s;
end;
$$;

-- Génère un slug unique : si "adelex-consulting" existe déjà, retourne
-- "adelex-consulting-2", -3, etc. Exclude un client_id donné (utile en UPDATE).
create or replace function public.generate_unique_slug(input text, exclude_id uuid default null)
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
    select 1 from public.clients
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    i := i + 1;
    candidate := base || '-' || i;
  end loop;
  return candidate;
end;
$$;

-- Colonne slug, indexée unique
alter table public.clients add column if not exists slug text;

-- Backfill : générer un slug pour tous les clients existants en respectant
-- l'ordre de création (le plus ancien obtient le slug "court", les autres
-- obtiennent les suffixes -2, -3 en cas de collision).
do $$
declare
  c record;
  new_slug text;
begin
  for c in select id, denomination from public.clients
           where slug is null order by created_at, id
  loop
    new_slug := public.generate_unique_slug(c.denomination, c.id);
    update public.clients set slug = new_slug where id = c.id;
  end loop;
end $$;

-- Maintenant que tous les clients ont un slug, on met la contrainte NOT NULL + UNIQUE
alter table public.clients alter column slug set not null;
alter table public.clients add constraint clients_slug_unique unique (slug);

-- Trigger : à chaque INSERT ou UPDATE de denomination, recalcule le slug si
-- absent. Si l'utilisateur fournit un slug explicite, on le respecte.
create or replace function public.clients_set_slug()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug(new.denomination, new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    -- Si la denomination change ET que le slug n'est pas modifié manuellement,
    -- on recalcule le slug pour qu'il suive le nom.
    if new.denomination is distinct from old.denomination
       and new.slug is not distinct from old.slug then
      new.slug := public.generate_unique_slug(new.denomination, new.id);
    end if;
    if new.slug is null or new.slug = '' then
      new.slug := public.generate_unique_slug(new.denomination, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_set_slug on public.clients;
create trigger trg_clients_set_slug
  before insert or update on public.clients
  for each row execute function public.clients_set_slug();
