-- Table de stockage des soumissions Tally en attente de rattachement manuel.
-- Le webhook insère ici. L'utilisateur rattache via l'UI à un client existant
-- → les fields sont appliqués sur le client et la ligne est marquée "processed".

create table if not exists public.tally_responses (
  id uuid primary key default gen_random_uuid(),
  form_id text not null,
  form_name text,
  response_id text,
  submission_id text,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  -- État du rattachement
  client_id uuid references public.clients(id) on delete set null,
  processed_at timestamptz,
  -- Métadonnées extraites pour faciliter le tri / la recherche dans l'UI
  guess_denomination text,
  guess_email text,
  guess_siren text
);

create unique index if not exists idx_tally_responses_submission_id
  on public.tally_responses (submission_id) where submission_id is not null;
create index if not exists idx_tally_responses_pending
  on public.tally_responses (received_at desc) where processed_at is null;

alter table public.tally_responses enable row level security;
create policy p_tally_responses_all on public.tally_responses
  for all to authenticated using (true) with check (true);
