-- Compléments LDM : on rend explicites les états "Inclus" / "Non souscrit"
-- pour le forfait juridique, et "Non souscrit" pour le pilotage.
--
-- Avant : un montant à 0 sur honoraires_jur OU forfait_pilotage était
-- ambigu (pas encore décidé vs. non souscrit). Maintenant chaque champ a
-- un flag explicite, et le générateur LDM applique la bonne phrase.

-- 1. Forfait juridique : trinôme Facturés / Inclus / Non souscrit
create type type_honos_jur_t as enum ('Facturés', 'Inclus', 'Non souscrit');
alter table public.clients
  add column if not exists type_honos_jur type_honos_jur_t;

-- 2. Forfait pilotage : ajout de "Non souscrit" comme 3e valeur de tdb_periode
-- (le null reste possible = "pas encore décidé", "Non souscrit" = choix
-- explicite "ce dossier ne souscrit pas au pilotage").
alter type tdb_periode_t add value if not exists 'Non souscrit';
