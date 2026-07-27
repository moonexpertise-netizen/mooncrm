-- ============================================================================
-- Modèles de mails LIBRES (créés depuis /parametrage/emails, générés en .eml
-- depuis la fiche client « Générer mail » et en masse depuis /documents).
--
-- Distinct de `email_templates` (migration 0085) qui porte les DEUX modèles
-- système figés du bouton « Envoyer le guide » (clés guide_creation /
-- guide_reprise) : ceux-là restent inchangés.
--
-- Pas de seed : la page affiche un état vide invitant à créer le 1er modèle.
-- ============================================================================

create table if not exists public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text,
  objet text not null,
  corps text not null,
  actif boolean not null default true,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tri du menu déroulant « Générer mail » : actifs d'abord, puis ordre manuel.
create index if not exists mail_templates_tri_idx
  on public.mail_templates (actif, ordre, nom);

alter table public.mail_templates enable row level security;

-- Lecture : tout utilisateur authentifié (le menu de génération en a besoin).
drop policy if exists "mail_templates readable" on public.mail_templates;
create policy "mail_templates readable"
  on public.mail_templates for select
  using (auth.uid() is not null);

-- Écriture : admin (aligné sur email_templates). Les server actions ajoutent
-- un contrôle applicatif sur la permission `edit_parametrage`.
drop policy if exists "mail_templates admin write" on public.mail_templates;
create policy "mail_templates admin write"
  on public.mail_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
