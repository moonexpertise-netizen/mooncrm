-- ============================================================================
-- Régime par exercice + obligation TVS unique
-- ----------------------------------------------------------------------------
-- 1. Ajout du type d'obligation 'TVS' (consolide les anciens TVS_MENSUELLE
--    et TVS_TRIMESTRIELLE en une seule obligation annuelle). L'échéance
--    sera calculée par le moteur en fonction du régime TVA.
-- 2. Table client_year_config : régime IR/IS par exercice, car un même
--    client peut changer de régime d'une année sur l'autre.
-- ============================================================================

alter type type_obligation add value if not exists 'TVS';

create table if not exists public.client_year_config (
  client_id uuid not null references public.clients(id) on delete cascade,
  annee smallint not null,
  regime regime,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, annee)
);

create index if not exists idx_year_config_client
  on public.client_year_config(client_id);

alter table public.client_year_config enable row level security;
create policy p_year_config_all on public.client_year_config
  for all to authenticated using (true) with check (true);

create trigger trg_year_config_updated
  before update on public.client_year_config
  for each row execute function public.set_updated_at();

-- Initialiser à partir de clients.regime + années connues via les subs
insert into public.client_year_config (client_id, annee, regime)
select distinct s.client_id, s.annee, c.regime
from public.obligation_subscriptions s
join public.clients c on c.id = s.client_id
where c.regime is not null
on conflict (client_id, annee) do nothing;
