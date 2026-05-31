-- ============================================================================
-- Cleanup colonnes orphelines (audit Benjamin · validation Drop pour tout).
--
-- Toutes les operations sont IF EXISTS pour idempotence : on peut rejouer
-- le script sans erreur.
--
-- IMPACT : 1 table + 12 colonnes + 1 index + 1 enum.
-- Aucun impact comportemental cote app (toutes les colonnes etaient mortes
-- ou redondantes).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Table public.users (entierement remplacee par public.profiles en 0032)
--    Doit etre droppe APRES la FK clients.collaborateur_id (cf section 2).
-- ----------------------------------------------------------------------------
-- (deplace plus bas, apres drop de la FK)

-- ----------------------------------------------------------------------------
-- 2. clients : champs Notion residuels jamais utilises
-- ----------------------------------------------------------------------------

-- URL Pappers/INPI : derivables de siren cote UI, jamais lues en DB
alter table public.clients drop column if exists pappers_url;
alter table public.clients drop column if exists inpi_url;

-- FK morte vers public.users
drop index if exists public.idx_clients_collab;
alter table public.clients drop column if exists collaborateur_id;

-- NOTE : `clients.regime` initialement candidat au drop, FINALEMENT CONSERVE.
-- Apres verification fine du code, il est massivement utilise :
--   - app/clients/page.tsx (liste)
--   - app/clients/[slug]/obligations/page.tsx
--   - app/parametrage/grid.tsx + actions.ts
--   - app/clients/[slug]/editable.tsx
-- Co-existe avec client_year_config.regime (par exercice). Refactor possible
-- en V2 si on veut unifier, mais hors scope de ce cleanup.

-- Vitesse TVA : importe depuis Notion, SELECTed dans 2 routes LDM mais
-- jamais consomme dans le payload final (cf. lib/ldm-generator.ts).
-- Code des 2 routes nettoye en parallele dans le meme commit.
alter table public.clients drop column if exists vitesse_tva;
drop type if exists vitesse_tva;

-- ----------------------------------------------------------------------------
-- 3. obligation_subscriptions : note inutilisee
-- ----------------------------------------------------------------------------

alter table public.obligation_subscriptions drop column if exists note;

-- ----------------------------------------------------------------------------
-- 4. onboarding_tasks : note inutilisee
-- ----------------------------------------------------------------------------

alter table public.onboarding_tasks drop column if exists note;

-- ----------------------------------------------------------------------------
-- 5. IR + CAA : notes et echeances jamais utilisees en UI
--    L'echeance fiscale est calculee a la volee, pas stockee par dossier.
-- ----------------------------------------------------------------------------

alter table public.clients_ir       drop column if exists note;
alter table public.clients_caa      drop column if exists note;
alter table public.ir_obligations   drop column if exists note;
alter table public.caa_obligations  drop column if exists note;
alter table public.ir_obligations   drop column if exists echeance;
alter table public.caa_obligations  drop column if exists echeance;

-- ----------------------------------------------------------------------------
-- 6. Table public.users : maintenant que la FK est partie, on peut drop.
--    CASCADE pour faire tomber les RLS policies p_users_self_* qui pointaient
--    sur cette table.
-- ----------------------------------------------------------------------------

drop table if exists public.users cascade;

commit;
