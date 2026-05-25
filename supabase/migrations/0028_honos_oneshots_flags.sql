-- Flags explicites pour les honoraires one-shot (création + reprise) :
-- Avant : montant à 0 servait de "Non souscrit" implicite, ambigu avec
--         "pas encore décidé".
-- Après : flag dédié "Facturés" / "Non souscrit". Si "Facturés" → on lit
--         honoraires_creation / honoraires_reprise pour le montant.

create type type_honos_oneshot_t as enum ('Facturés', 'Non souscrit');

alter table public.clients
  add column if not exists type_honos_creation type_honos_oneshot_t,
  add column if not exists type_honos_reprise type_honos_oneshot_t;
