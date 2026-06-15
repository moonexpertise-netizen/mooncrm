-- ============================================================================
-- Fix : ajoute une policy INSERT sur client_audit_log
--
-- La 0072 a active RLS sur la table sans creer de policy INSERT, en
-- partant du principe que le trigger audit_client_changes (SECURITY
-- DEFINER) bypasserait la RLS. C'est vrai uniquement si le owner du
-- trigger a l'attribut BYPASSRLS (typiquement postgres superuser).
-- Sur Supabase, selon la facon dont les migrations sont appliquees,
-- le owner peut etre un role sans BYPASSRLS - dans ce cas, l'INSERT
-- echoue silencieusement (car wrappe en EXCEPTION dans la 0073).
--
-- Resultat observe : l'UPDATE pipeline_statut reussit (grace a 0073),
-- mais aucune entree d'historique n'est creee dans client_audit_log.
--
-- Fix : policy INSERT permissive (WITH CHECK (true)). Pas de risque de
-- securite : la table est ecrite UNIQUEMENT par le trigger, jamais
-- par du code utilisateur direct, et le contenu est purement metier
-- (audit log lisible par tous les users approuves de toute facon).
-- ============================================================================

drop policy if exists "audit_log_insert" on public.client_audit_log;
create policy "audit_log_insert" on public.client_audit_log for insert
  with check (true);
