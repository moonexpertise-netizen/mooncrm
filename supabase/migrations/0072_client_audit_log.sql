-- ============================================================================
-- Historique des modifications par client (audit log)
--
-- Une table client_audit_log + un trigger BEFORE UPDATE sur clients qui
-- capture tous les changements de champs trackés et insere une ligne par
-- champ modifie. Atomique : la mutation et son audit commitent ensemble.
--
-- Champs trackes :
--   - pipeline_statut          (mouvement commercial)
--   - honoraires_compta        (MRR principal)
--   - forfait_bilan            (forfait annuel)
--   - honoraires_jur           (juridique recurrent)
--   - honoraires_creation      (one-shot creation)
--   - honoraires_reprise       (one-shot reprise)
--   - mrr_conditionne          (flag MRR conditionnel)
--   - mois_signature           (date business)
--   - gestion_tns              (flag TNS)
--   - regime                   (IR/IS)
--   - denomination             (rare mais utile)
--   - type_honos_bilans, type_honos_jur, type_honos_creation, type_honos_reprise
--     (cadre de facturation choisi)
--
-- Source : "manuel" par defaut (UI) ; peut etre surcharge via
-- SET LOCAL app.audit_source = 'jarvis' avant l'UPDATE pour distinguer
-- les modifs IA. changed_by = auth.uid() (Supabase JWT).
--
-- Idempotent : tous les CREATE sont OR REPLACE / IF NOT EXISTS.
-- ============================================================================

create table if not exists public.client_audit_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  source text not null default 'manuel'
);

create index if not exists idx_audit_client_changed
  on public.client_audit_log(client_id, changed_at desc);

-- Trigger function : compare OLD vs NEW pour chaque champ tracke, insere
-- une ligne par changement. Si aucun champ tracke ne change, ne fait rien.
create or replace function public.audit_client_changes()
returns trigger
language plpgsql
security definer
as $$
declare
  uid uuid;
  uemail text;
  src text;
begin
  -- Utilisateur courant (Supabase JWT). Null si modif via service_role.
  uid := auth.uid();
  if uid is not null then
    select email into uemail from public.profiles where id = uid;
  end if;

  -- Source : surcharge possible via SET LOCAL app.audit_source = '...'
  -- avant l'UPDATE. Defaut "manuel" (UI / clic humain).
  src := coalesce(nullif(current_setting('app.audit_source', true), ''), 'manuel');

  -- Helper inline : insert si valeur change. NULLIF + IS DISTINCT FROM
  -- gere les transitions vers/depuis NULL proprement.

  if new.pipeline_statut is distinct from old.pipeline_statut then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'pipeline_statut', old.pipeline_statut::text, new.pipeline_statut::text, uid, uemail, src);
  end if;

  if new.honoraires_compta is distinct from old.honoraires_compta then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_compta', old.honoraires_compta::text, new.honoraires_compta::text, uid, uemail, src);
  end if;

  if new.forfait_bilan is distinct from old.forfait_bilan then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'forfait_bilan', old.forfait_bilan::text, new.forfait_bilan::text, uid, uemail, src);
  end if;

  if new.honoraires_jur is distinct from old.honoraires_jur then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_jur', old.honoraires_jur::text, new.honoraires_jur::text, uid, uemail, src);
  end if;

  if new.honoraires_creation is distinct from old.honoraires_creation then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_creation', old.honoraires_creation::text, new.honoraires_creation::text, uid, uemail, src);
  end if;

  if new.honoraires_reprise is distinct from old.honoraires_reprise then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'honoraires_reprise', old.honoraires_reprise::text, new.honoraires_reprise::text, uid, uemail, src);
  end if;

  if new.mrr_conditionne is distinct from old.mrr_conditionne then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'mrr_conditionne', old.mrr_conditionne::text, new.mrr_conditionne::text, uid, uemail, src);
  end if;

  if new.mois_signature is distinct from old.mois_signature then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'mois_signature', old.mois_signature::text, new.mois_signature::text, uid, uemail, src);
  end if;

  if new.gestion_tns is distinct from old.gestion_tns then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'gestion_tns', old.gestion_tns::text, new.gestion_tns::text, uid, uemail, src);
  end if;

  if new.type_honos_bilans is distinct from old.type_honos_bilans then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_bilans', old.type_honos_bilans::text, new.type_honos_bilans::text, uid, uemail, src);
  end if;

  if new.type_honos_jur is distinct from old.type_honos_jur then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_jur', old.type_honos_jur::text, new.type_honos_jur::text, uid, uemail, src);
  end if;

  if new.type_honos_creation is distinct from old.type_honos_creation then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_creation', old.type_honos_creation::text, new.type_honos_creation::text, uid, uemail, src);
  end if;

  if new.type_honos_reprise is distinct from old.type_honos_reprise then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'type_honos_reprise', old.type_honos_reprise::text, new.type_honos_reprise::text, uid, uemail, src);
  end if;

  if new.denomination is distinct from old.denomination then
    insert into public.client_audit_log (client_id, field, old_value, new_value, changed_by, changed_by_email, source)
    values (new.id, 'denomination', old.denomination, new.denomination, uid, uemail, src);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clients_audit on public.clients;
create trigger trg_clients_audit
  after update on public.clients
  for each row execute function public.audit_client_changes();

-- RLS : pour l'instant, tous les users approuves peuvent lire / vider
-- l'historique. Le bouton "Vider" est confirme via dialogue cote UI.
alter table public.client_audit_log enable row level security;

drop policy if exists "audit_log_read" on public.client_audit_log;
create policy "audit_log_read" on public.client_audit_log for select
  using (true);

drop policy if exists "audit_log_delete" on public.client_audit_log;
create policy "audit_log_delete" on public.client_audit_log for delete
  using (true);

-- Pas de policy INSERT : la table n'est ecrite que par le trigger, qui
-- tourne en SECURITY DEFINER (= bypasse RLS). Inutile d'exposer un INSERT
-- direct aux users.
