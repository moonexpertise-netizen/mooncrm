-- ============================================================================
-- TVA mensuelles : etiquettes (tags) + jour d'echeance par client.
--
-- Use case :
--   - Etiquettes libres pour categoriser un dossier TVA selon sa vitesse de
--     realisation : "TVA Express", "TVA + longue", "TVA Standard", etc.
--     Un seul tag par client (CRUD libre, le user cree les tags qu'il veut).
--   - Jour d'echeance configurable par client (par defaut 24 du mois suivant).
--     Sert au calcul du "mois actuel TVA" (vue 3 mois) et a la pastille
--     "echeance proche" ligne par ligne.
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE tva_tags
-- ----------------------------------------------------------------------------
create table if not exists public.tva_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color text not null default 'zinc',
  ordre int not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Unicite du libelle (case-insensitive) : evite "TVA Express" + "tva express"
create unique index if not exists tva_tags_label_lower_uniq
  on public.tva_tags (lower(label));

-- Palette autorisee (cf. StatusFilterChip + FactPicker pour coherence)
alter table public.tva_tags
  drop constraint if exists tva_tags_color_check;
alter table public.tva_tags
  add constraint tva_tags_color_check
  check (color in ('zinc', 'sky', 'emerald', 'amber', 'violet', 'rose', 'teal', 'indigo'));

-- ----------------------------------------------------------------------------
-- COLONNES sur clients : tag + jour echeance
-- ----------------------------------------------------------------------------
alter table public.clients
  add column if not exists tva_tag_id uuid references public.tva_tags(id) on delete set null,
  add column if not exists tva_echeance_jour int;

-- echeance_jour : 1..31 (NULL = defaut 24)
alter table public.clients
  drop constraint if exists clients_tva_echeance_jour_check;
alter table public.clients
  add constraint clients_tva_echeance_jour_check
  check (tva_echeance_jour is null or (tva_echeance_jour between 1 and 31));

-- Index pour le filtre par tag dans le tracker TVA
create index if not exists clients_tva_tag_id_idx
  on public.clients (tva_tag_id)
  where tva_tag_id is not null;

-- ----------------------------------------------------------------------------
-- SEEDS : quelques tags d'exemple (creation seulement si la table est vide).
--         L'utilisateur les renomme/supprime/ajoute via /parametrage/tva-tags.
-- ----------------------------------------------------------------------------
insert into public.tva_tags (label, color, ordre)
select * from (values
  ('TVA Express', 'emerald', 1),
  ('TVA Standard', 'sky', 2),
  ('TVA + longue', 'amber', 3)
) as v(label, color, ordre)
where not exists (select 1 from public.tva_tags);
