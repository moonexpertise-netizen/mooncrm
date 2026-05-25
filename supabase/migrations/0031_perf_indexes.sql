-- ============================================================================
-- Index manquants pour les requêtes fréquentes du CRM.
-- Audit perf : la page /obligations/suivi et la fiche client font des sélections
-- qui finissent en seq_scan sur obligations (~quelques milliers de lignes
-- à terme). Idem clients/denomination pour la recherche, et client_contacts
-- pour la jointure inverse (qui sert à updateContact).
-- Toutes les CREATE INDEX sont IF NOT EXISTS pour être idempotentes.
-- ============================================================================

-- obligations : la vue "Suivi des obligations" filtre par (annee, type) puis
-- groupe par client_id. L'index existant idx_obl_type_annee couvre (type,
-- annee) mais pas le tri par client. On ajoute la combinaison (client_id,
-- annee) qui sert aussi à la fiche client (matrice obligations d'une année).
create index if not exists idx_obl_client_annee
  on public.obligations(client_id, annee);

-- Pour /obligations/suivi : filtre par (annee, type) ET ensuite par
-- statut_logique. Index ciblé pour skip les rangées NON_APPLICABLE/TERMINE
-- côté planning Kanban.
create index if not exists idx_obl_annee_type_statut
  on public.obligations(annee, type, statut_logique);

-- clients : la recherche /clients fait des ilike sur denomination. L'index
-- trigram permet à ilike '%foo%' d'être indexé (Postgres extension pg_trgm).
-- On crée l'extension si elle ne l'est pas déjà.
create extension if not exists pg_trgm;
create index if not exists idx_clients_denomination_trgm
  on public.clients using gin (denomination gin_trgm_ops);

-- Aussi : recherche SIREN, fréquente dans le tracker.
create index if not exists idx_clients_siren
  on public.clients(siren)
  where siren is not null;

-- client_contacts : la jointure inverse (par contact_id) sert pour propager
-- une modif de contact à tous les clients liés (updateContact). Sans cet
-- index, c'est un seq_scan.
create index if not exists idx_client_contacts_contact
  on public.client_contacts(contact_id);

-- obligation_subscriptions : recherche fréquente par (client_id, annee,
-- actif=true) dans regenerateObligationsForYear et setSubActive.
create index if not exists idx_subs_client_annee_actif
  on public.obligation_subscriptions(client_id, annee, actif);
