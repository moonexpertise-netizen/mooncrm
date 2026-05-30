-- ============================================================================
-- Suivi creations societes : colonne creation_statut sur clients.
--
-- Concerne uniquement les dossiers avec origine = '1 - Création'. Pour les
-- autres, la colonne reste null.
--
-- Etapes :
--   a_traiter        : a faire (initial)
--   depot_capital    : en cours (depot du capital social)
--   inpi_en_cours    : en cours (demande INPI envoyee)
--   inpi_termine     : en cours (INPI valide, en attente du KBIS)
--   actee_kbis_recu  : termine (creation finalisee)
--
-- Idempotent.
-- ============================================================================

alter table public.clients
  add column if not exists creation_statut text;

alter table public.clients
  drop constraint if exists clients_creation_statut_check;
alter table public.clients
  add constraint clients_creation_statut_check
  check (creation_statut is null or creation_statut in (
    'a_traiter',
    'depot_capital',
    'inpi_en_cours',
    'inpi_termine',
    'actee_kbis_recu'
  ));

-- Backfill : tous les dossiers en origine '1 - Création' sans statut prennent
-- 'a_traiter' par defaut.
update public.clients
   set creation_statut = 'a_traiter'
 where origine = '1 - Création'
   and creation_statut is null;

-- Trigger : a chaque changement d'origine, si on passe a '1 - Création' et
-- que creation_statut est null, on initialise a 'a_traiter'. Si on quitte
-- cette origine, on ne touche PAS (le user peut vouloir garder l'historique
-- du statut au cas ou).
create or replace function public.auto_init_creation_statut()
returns trigger
language plpgsql
as $$
begin
  if new.origine = '1 - Création'
     and (old.origine is null or old.origine <> '1 - Création')
     and new.creation_statut is null then
    new.creation_statut := 'a_traiter';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_auto_init_creation_statut on public.clients;
create trigger trg_clients_auto_init_creation_statut
  before insert or update of origine on public.clients
  for each row execute function public.auto_init_creation_statut();
