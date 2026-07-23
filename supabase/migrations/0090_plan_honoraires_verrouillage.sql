-- 0090 : Verrouillage du "plan d'honoraires".
--
-- Modèle voulu : on saisit TOUT librement (aucun blocage champ par champ),
-- puis on verrouille le plan d'un seul geste. Pour le modifier ensuite, on
-- ouvre un "nouveau plan d'honoraires" en justifiant une fois — ce qui
-- déverrouille l'ensemble des montants d'un coup.
--
-- Défaut à false : les dossiers existants restent modifiables tant que
-- Benjamin ne les a pas verrouillés (aucune régression).

alter table public.clients
  add column if not exists honoraires_verrouille boolean not null default false,
  add column if not exists honoraires_verrouille_at timestamptz;

comment on column public.clients.honoraires_verrouille is
  'Plan d''honoraires verrouillé : les montants passent en lecture seule. Déverrouillage via "Nouveau plan d''honoraires" (motif obligatoire, journalisé).';
comment on column public.clients.honoraires_verrouille_at is
  'Horodatage du dernier verrouillage du plan d''honoraires.';
