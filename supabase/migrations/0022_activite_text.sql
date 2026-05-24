-- Convertit clients.activite de enum activite → text libre.
-- Permet de saisir n'importe quelle activité (Tally + UI). L'enum est conservé
-- mais plus utilisé. On le drop pour propreté.

alter table public.clients alter column activite type text using activite::text;
drop type if exists activite;
