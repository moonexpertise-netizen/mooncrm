-- ============================================================================
-- Forfait de début d'activité + Bilan 1ère année offert + statut facturation
-- "offert" pour les bilans.
--
-- 1) Forfait de début d'activité (clients) : tarif mensuel réduit la 1ère
--    année jusqu'à une condition de fin. IMPACT = lettre de mission uniquement
--    (le MRR reste au tarif de croisière -> aucune colonne générée touchée).
--
-- 2) Bilan 1ère année offert (clients) : flag pour la LDM. Lié automatiquement
--    au statut de facturation "offert" du 1er bilan (géré côté app).
--
-- 3) etat_facturation "offert" (obligations) : nouveau statut de facturation
--    pour les bilans (LIASSE_PLAQUETTE), traité comme "ne pas facturer".
-- ============================================================================

-- 1) Forfait de début d'activité --------------------------------------------
alter table public.clients
  add column if not exists forfait_debut_montant numeric(10,2) not null default 0;

alter table public.clients
  add column if not exists forfait_debut_date_debut date;

-- Condition de fin : 'Début de facturation' (évènement) | 'Nombre de mois' | 'Date'
alter table public.clients
  add column if not exists forfait_debut_condition text
    check (forfait_debut_condition is null
           or forfait_debut_condition in ('Début de facturation', 'Nombre de mois', 'Date'));

alter table public.clients
  add column if not exists forfait_debut_nb_mois integer;

alter table public.clients
  add column if not exists forfait_debut_date_fin date;

-- Passé à true via le bouton "Rythme de croisière atteint" -> sort du suivi
-- et n'apparaît plus dans la LDM.
alter table public.clients
  add column if not exists forfait_debut_termine boolean not null default false;

-- 2) Bilan 1ère année offert -------------------------------------------------
alter table public.clients
  add column if not exists bilan_premier_offert boolean not null default false;

-- 3) etat_facturation "offert" sur obligations (bilans LIASSE_PLAQUETTE) ------
alter table public.obligations
  drop constraint if exists obligations_etat_facturation_check;
alter table public.obligations
  add constraint obligations_etat_facturation_check
  check (etat_facturation is null
         or etat_facturation in ('a_facturer', 'facturee', 'payee', 'sans_facture', 'offert'));
