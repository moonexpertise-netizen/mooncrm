-- ============================================================================
-- Rend l'audit trigger robuste : sans RLS sur audit_log, sans SECURITY
-- DEFINER, avec une NOTICE de demarrage qui confirme que le trigger fire.
--
-- Constat : meme apres 0074 (policy INSERT), aucune entree dans
-- client_audit_log. Cause possible : SECURITY DEFINER + role function
-- + permissions qui ne se croisent pas comme on l'esperait. Pour eviter
-- toutes ces subtilites :
--
--   1. Desactive RLS sur la table audit_log (purement metier, lisible
--      par tous les users approuves de toute facon). Aucune donnee
--      sensible : c'est juste un historique de modifs sur clients.
--   2. Retire SECURITY DEFINER : le trigger tourne maintenant dans le
--      contexte de l'utilisateur appelant (qui a les permissions
--      UPDATE sur clients, donc deja autorise a faire la modif).
--   3. Ajoute une RAISE NOTICE en debut de fonction : permet de verifier
--      dans Supabase Logs > Postgres que le trigger fire bien quand on
--      UPDATE un client. Si on voit pas la notice, c'est que le trigger
--      lui-meme n'est pas installe ou ne se declenche pas.
-- ============================================================================

-- 1. Disable RLS - audit_log purement metier
alter table public.client_audit_log disable row level security;

-- 2. Recree la fonction sans SECURITY DEFINER, avec NOTICE diagnostic
create or replace function public.audit_client_changes()
returns trigger
language plpgsql
as $$
declare
  uid uuid;
  uemail text;
  src text;
begin
  raise notice 'audit_client_changes fire pour client_id=%, op=%', new.id, tg_op;

  -- Tout l'audit reste defensif : un echec ne doit jamais bloquer l'UPDATE.
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
    raise warning 'audit_client_changes a echoue pour client_id=%, erreur=%, sqlstate=%', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

-- 3. Recree le trigger pour etre sur qu'il est bien installe et lie a la
--    bonne fonction (au cas ou il aurait ete drop ou pas cree initialement).
drop trigger if exists trg_clients_audit on public.clients;
create trigger trg_clients_audit
  after update on public.clients
  for each row execute function public.audit_client_changes();
