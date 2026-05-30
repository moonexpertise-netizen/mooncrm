-- ============================================================================
-- Suivi creations : annee de creation par dossier (1 max par client).
--
-- Different d'IR/CAA ou un client peut etre souscrit a plusieurs annees :
-- une creation de societe est un one-shot, donc 1 seule annee max.
--
-- Logique :
--   - creation_annee NULL : pas encore d'annee definie (vue Base affiche
--     toutes les annees comme cliquables)
--   - creation_annee = N : le dossier est souscrit a l'annee N. La vue Annee
--     filtree sur N affiche ce dossier avec son creation_statut.
--
-- Idempotent.
-- ============================================================================

alter table public.clients
  add column if not exists creation_annee int;

-- Backfill : pour tous les '1 - Création' sans annee, on prend l'annee du
-- mois_signature si dispo, sinon l'annee courante. Permet d'avoir une vue
-- non vide tout de suite.
update public.clients
   set creation_annee = coalesce(
     extract(year from mois_signature)::int,
     extract(year from now())::int
   )
 where origine = '1 - Création'
   and creation_annee is null;
