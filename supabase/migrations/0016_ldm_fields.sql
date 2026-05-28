-- Colonnes nécessaires à la génération de la LDM (lettre de mission).
-- Phase 1 : saisie manuelle. Phase 2 : auto-fill Pappers (Reprise) + Tally (Création).

-- Adresse du siège social (3 champs séparés pour mailing propre)
alter table public.clients
  add column if not exists adresse_siege text,
  add column if not exists code_postal text,
  add column if not exists ville text;

-- Date de fin de mission (ex : 31/12/2026 - LDM annuelle renouvelable).
-- Optionnelle : si null, génère 31/12 de l'année courante par défaut.
alter table public.clients
  add column if not exists fin_mission_date date;

-- Civilité du dirigeant pour la LDM
create type civilite_t as enum ('M.', 'Mme', 'Mlle');
alter table public.contacts
  add column if not exists civilite civilite_t;
