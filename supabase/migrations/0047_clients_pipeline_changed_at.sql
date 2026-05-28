-- ============================================================================
-- Ajoute clients.pipeline_changed_at : timestamp de la derniere bascule
-- du pipeline_statut. Sert au tri du kanban (dernier arrive = en haut)
-- et a la vue chronologique des prospects.
--
-- Mecanique :
--   - INSERT  : pipeline_changed_at = now() (le dossier "arrive" dans son
--               statut initial des sa creation).
--   - UPDATE  : pipeline_changed_at = now() UNIQUEMENT si pipeline_statut
--               change. Si on edite autre chose (denomination, adresse...),
--               on ne touche pas a pipeline_changed_at.
--
-- Idempotent : on peut re-executer la migration sans risque.
-- ============================================================================

alter table public.clients
  add column if not exists pipeline_changed_at timestamptz;

-- Backfill : pour les clients existants, on initialise avec updated_at
-- (best-effort - la vraie date d'arrivee dans le statut n'est pas tracee
-- avant cette migration).
update public.clients
   set pipeline_changed_at = coalesce(updated_at, created_at, now())
 where pipeline_changed_at is null;

-- Trigger : maintient pipeline_changed_at a jour automatiquement.
create or replace function public.clients_set_pipeline_changed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.pipeline_changed_at is null then
      new.pipeline_changed_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if new.pipeline_statut is distinct from old.pipeline_statut then
      new.pipeline_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_pipeline_changed_at on public.clients;
create trigger trg_clients_pipeline_changed_at
  before insert or update on public.clients
  for each row execute function public.clients_set_pipeline_changed_at();

-- Index pour le tri du kanban (1 par etape, tri DESC sur pipeline_changed_at)
create index if not exists idx_clients_pipeline_changed_at
  on public.clients (pipeline_statut, pipeline_changed_at desc);
