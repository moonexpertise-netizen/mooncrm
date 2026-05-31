-- ============================================================================
-- Facturation creations : colonne creation_facturation sur clients.
--
-- Pendant du facturation IR/CAA mais au niveau client (1 creation = 1 facture,
-- pas par annee). Quand creation_statut passe a 'actee_kbis_recu' (= TERMINE),
-- on bascule creation_facturation a 'a_facturer' automatiquement.
--
-- Valeurs :
--   a_facturer    : facture a emettre (par defaut quand KBIS recu)
--   facturee      : facture deja emise
--   sans_facture  : pas de facturation (gratuit, courtoisie, etc.)
--   NULL          : pas encore decide
--
-- Idempotent.
-- ============================================================================

alter table public.clients
  add column if not exists creation_facturation text;

alter table public.clients
  drop constraint if exists clients_creation_facturation_check;
alter table public.clients
  add constraint clients_creation_facturation_check
  check (creation_facturation is null or creation_facturation in (
    'a_facturer',
    'facturee',
    'sans_facture'
  ));

-- ----------------------------------------------------------------------------
-- BACKFILL one-shot : tous les dossiers deja en KBIS recu sans facturation
-- definie passent en 'a_facturer'.
-- ----------------------------------------------------------------------------
update public.clients
   set creation_facturation = 'a_facturer'
 where creation_statut = 'actee_kbis_recu'
   and creation_facturation is null;

-- ----------------------------------------------------------------------------
-- TRIGGER UPDATE : passage en actee_kbis_recu => set 'a_facturer' (sauf si
-- l'user a deja choisi explicitement sans_facture ou facturee).
-- ----------------------------------------------------------------------------
create or replace function public.auto_facturation_on_creation_kbis()
returns trigger
language plpgsql
as $$
begin
  if new.creation_statut = 'actee_kbis_recu'
     and (old.creation_statut is null or old.creation_statut <> 'actee_kbis_recu')
     and new.creation_facturation is null then
    new.creation_facturation := 'a_facturer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_auto_facturation_creation on public.clients;
create trigger trg_clients_auto_facturation_creation
  before update of creation_statut on public.clients
  for each row execute function public.auto_facturation_on_creation_kbis();

-- ----------------------------------------------------------------------------
-- TRIGGER INSERT : meme logique pour une row arrivant deja en KBIS recu.
-- ----------------------------------------------------------------------------
create or replace function public.auto_facturation_on_creation_kbis_insert()
returns trigger
language plpgsql
as $$
begin
  if new.creation_statut = 'actee_kbis_recu' and new.creation_facturation is null then
    new.creation_facturation := 'a_facturer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_auto_facturation_creation_insert on public.clients;
create trigger trg_clients_auto_facturation_creation_insert
  before insert on public.clients
  for each row execute function public.auto_facturation_on_creation_kbis_insert();
