-- ============================================================================
-- AGO : passe le statut "2 - Depose" de EN_COURS a TERMINE (vert).
--
-- Logique metier : une fois le bilan deposé au greffe, l'AGO est consideré
-- comme realisé. Le statut "3 - Validé par greffe" reste TERMINE aussi
-- (les deux sont verts).
--
-- Idempotent : update conditional.
-- ============================================================================

update public.status_options
   set statut_logique = 'TERMINE'
 where scope = 'obligation'
   and type_code = 'AGO_DEPOT'
   and libelle = '2 - Déposé'
   and statut_logique = 'EN_COURS';

-- Backfill : les obligations existantes en statut "2 - Déposé" sont mises
-- en TERMINE pour rester coherentes avec le nouveau mapping.
update public.obligations
   set statut_logique = 'TERMINE'
 where type = 'AGO_DEPOT'
   and statut_detail = '2 - Déposé'
   and statut_logique = 'EN_COURS';
