-- Migration 0064 : etat_facturation nullable sur missions_exceptionnelles
--
-- Avant : etat_facturation NOT NULL DEFAULT 'a_facturer'. Toutes les nouvelles
-- missions etaient marquees "À facturer" des leur creation, meme non livrees.
--
-- Apres : etat_facturation peut etre NULL. UI affiche "—" tant que la mission
-- n'est pas livree. Au passage en "livree", le code applicatif (et le trigger
-- DB existant auto_facturation_on_livree_mex) set automatiquement a "a_facturer".
--
-- Coherent avec le pattern utilise sur caa_obligations / ir_obligations /
-- clients.creation_facturation (toutes nullable).

alter table public.missions_exceptionnelles
  alter column etat_facturation drop not null;

alter table public.missions_exceptionnelles
  alter column etat_facturation drop default;

-- Met a jour la contrainte CHECK pour autoriser NULL
alter table public.missions_exceptionnelles
  drop constraint if exists missions_exceptionnelles_etat_facturation_check;

alter table public.missions_exceptionnelles
  add constraint missions_exceptionnelles_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'sans_facture'));

-- Backfill : missions non livrees qui sont encore au default 'a_facturer'
-- -> on les passe a NULL. On ne touche PAS les missions ou l'user a deja
-- explicitement choisi 'facturee' ou 'sans_facture' (info utilisateur a preserver).
-- Pour les missions livrees, on garde 'a_facturer' (c'est l'etat correct).
update public.missions_exceptionnelles
set etat_facturation = null
where etat_mission != 'livree'
  and etat_facturation = 'a_facturer';
