-- ============================================================================
-- Audit trigger : reconstruction complete + fonction de diagnostic.
--
-- Le trigger n'enregistre toujours rien apres 0072-0075. Plutot que
-- d'empiler les patches, on reconstruit tout from scratch et on ajoute
-- une fonction debug_audit() que Benjamin peut appeler depuis le SQL
-- Editor pour diagnostiquer en direct.
-- ============================================================================

-- 1. Drop tout
drop trigger if exists trg_clients_audit on public.clients;
drop function if exists public.audit_client_changes() cascade;

-- 2. Recree la table si pas presente (idempotent)
create table if not exists public.client_audit_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_email text,
  source text not null default 'manuel'
);

-- Pas de RLS, audit metier ouvert.
alter table public.client_audit_log disable row level security;

create index if not exists idx_audit_client_changed
  on public.client_audit_log(client_id, changed_at desc);

-- 3. Fonction trigger ultra-defensive avec NOTICE a chaque etape
create function public.audit_client_changes()
returns trigger
language plpgsql
as $$
declare
  uid uuid;
  uemail text;
  src text;
  cnt int;
begin
  raise notice '[audit] trigger fire, client_id=%, tg_op=%', new.id, tg_op;

  begin
    uid := auth.uid();
    raise notice '[audit] auth.uid()=%', uid;
  exception when others then
    raise notice '[audit] auth.uid() failed: %', sqlerrm;
    uid := null;
  end;

  if uid is not null then
    begin
      select email into uemail from public.profiles where id = uid;
    exception when others then
      uemail := null;
    end;
  end if;

  begin
    src := coalesce(nullif(current_setting('app.audit_source', true), ''), 'manuel');
  exception when others then
    src := 'manuel';
  end;
  raise notice '[audit] source=%, email=%', src, uemail;

  cnt := 0;

  if new.pipeline_statut is distinct from old.pipeline_statut then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'pipeline_statut', old.pipeline_statut::text, new.pipeline_statut::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.honoraires_compta is distinct from old.honoraires_compta then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_compta', old.honoraires_compta::text, new.honoraires_compta::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.forfait_bilan is distinct from old.forfait_bilan then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'forfait_bilan', old.forfait_bilan::text, new.forfait_bilan::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.honoraires_jur is distinct from old.honoraires_jur then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_jur', old.honoraires_jur::text, new.honoraires_jur::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.honoraires_creation is distinct from old.honoraires_creation then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_creation', old.honoraires_creation::text, new.honoraires_creation::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.honoraires_reprise is distinct from old.honoraires_reprise then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_reprise', old.honoraires_reprise::text, new.honoraires_reprise::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.mrr_conditionne is distinct from old.mrr_conditionne then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'mrr_conditionne', old.mrr_conditionne::text, new.mrr_conditionne::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.mois_signature is distinct from old.mois_signature then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'mois_signature', old.mois_signature::text, new.mois_signature::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.gestion_tns is distinct from old.gestion_tns then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'gestion_tns', old.gestion_tns::text, new.gestion_tns::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.type_honos_bilans is distinct from old.type_honos_bilans then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_bilans', old.type_honos_bilans::text, new.type_honos_bilans::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.type_honos_jur is distinct from old.type_honos_jur then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_jur', old.type_honos_jur::text, new.type_honos_jur::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.type_honos_creation is distinct from old.type_honos_creation then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_creation', old.type_honos_creation::text, new.type_honos_creation::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.type_honos_reprise is distinct from old.type_honos_reprise then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_reprise', old.type_honos_reprise::text, new.type_honos_reprise::text, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  if new.denomination is distinct from old.denomination then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'denomination', old.denomination, new.denomination, uid, uemail, src);
    cnt := cnt + 1;
  end if;

  raise notice '[audit] inserted % rows', cnt;
  return new;
exception when others then
  raise warning '[audit] FAILED for client_id=%, error=%, sqlstate=%', new.id, sqlerrm, sqlstate;
  return new;
end;
$$;

-- 4. Recree le trigger
create trigger trg_clients_audit
  after update on public.clients
  for each row execute function public.audit_client_changes();

-- 5. Fonction de diagnostic appelable depuis SQL Editor :
--    select * from public.debug_audit();
-- Renvoie : nb rows dans audit_log, presence du trigger, et test manuel
-- d'insert.
create or replace function public.debug_audit()
returns table(check_name text, result text)
language plpgsql
as $$
declare
  trigger_exists boolean;
  row_count int;
  test_id uuid;
  test_client_id uuid;
begin
  -- Check 1 : trigger existe ?
  select exists(
    select 1 from pg_trigger
    where tgname = 'trg_clients_audit'
      and tgrelid = 'public.clients'::regclass
  ) into trigger_exists;
  check_name := 'trigger_exists';
  result := trigger_exists::text;
  return next;

  -- Check 2 : combien de rows dans audit_log ?
  select count(*) into row_count from public.client_audit_log;
  check_name := 'audit_log_total_rows';
  result := row_count::text;
  return next;

  -- Check 3 : essaie un INSERT manuel
  select id into test_client_id from public.clients limit 1;
  if test_client_id is not null then
    begin
      insert into public.client_audit_log (client_id, field, old_value, new_value, source)
      values (test_client_id, '__debug__', 'before', 'after', 'debug')
      returning id into test_id;
      check_name := 'manual_insert';
      result := 'OK id=' || test_id::text;
      return next;
      -- Cleanup
      delete from public.client_audit_log where id = test_id;
    exception when others then
      check_name := 'manual_insert';
      result := 'FAILED: ' || sqlerrm;
      return next;
    end;
  end if;

  -- Check 4 : auth.uid() est-il dispo ?
  begin
    perform auth.uid();
    check_name := 'auth_uid_callable';
    result := coalesce(auth.uid()::text, 'NULL');
    return next;
  exception when others then
    check_name := 'auth_uid_callable';
    result := 'FAILED: ' || sqlerrm;
    return next;
  end;
end;
$$;
