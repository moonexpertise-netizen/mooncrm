-- ============================================================================
-- Rend le trigger audit_client_changes defensif : si le log echoue
-- (permissions, contrainte, type cast, etc.), on continue silencieusement
-- au lieu de faire rollback toute la transaction.
--
-- Bug observe : passer un client de "Z - Perdu dans l'espace" vers "3 - PC
-- a preparer" jetait une erreur cote app, probablement parce que le trigger
-- echouait sur un detail (auth.uid() lookup, profile join, cast enum...) et
-- la transaction etait rollback - du coup l'UPDATE etait annule lui aussi.
--
-- L'audit log est nice-to-have : il ne doit JAMAIS empecher une modif metier
-- legitime. On wrap chaque INSERT dans un BEGIN/EXCEPTION et on raise notice
-- en cas de souci (visible en logs Postgres).
-- ============================================================================

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
  -- Tout l'audit est wrappé : un echec ici ne doit JAMAIS bloquer l'UPDATE
  -- principal sur clients. On capture, on logge en notice, on continue.
  begin
    uid := auth.uid();
    if uid is not null then
      begin
        select email into uemail from public.profiles where id = uid;
      exception when others then
        uemail := null;
      end;
    end if;

    src := coalesce(nullif(current_setting('app.audit_source', true), ''), 'manuel');

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
  exception when others then
    -- Audit est nice-to-have, jamais bloquant. On logge l'erreur en
    -- Postgres notice (visible dans Supabase Logs > Postgres) et on
    -- continue, l'UPDATE principal sur clients reste valide.
    raise warning 'audit_client_changes a echoue pour client_id=%, erreur=%', new.id, sqlerrm;
  end;

  return new;
end;
$$;
