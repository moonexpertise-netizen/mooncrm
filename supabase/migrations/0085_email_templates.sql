-- ============================================================================
-- Modèles d'e-mails éditables (envoi du guide création / reprise).
--
-- Clés : 'guide_creation' | 'guide_reprise'. Si une clé est absente, le code
-- retombe sur les défauts (lib/email-templates-defaults.ts) — donc PAS de seed
-- ici : la page /parametrage/emails affiche les défauts et crée la ligne au
-- 1er enregistrement.
-- ============================================================================

create table if not exists public.email_templates (
  key text primary key check (key in ('guide_creation', 'guide_reprise')),
  subject text not null,
  body text not null,
  updated_at timestamptz default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "email_templates readable" on public.email_templates;
create policy "email_templates readable"
  on public.email_templates for select
  using (auth.uid() is not null);

drop policy if exists "email_templates admin write" on public.email_templates;
create policy "email_templates admin write"
  on public.email_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
