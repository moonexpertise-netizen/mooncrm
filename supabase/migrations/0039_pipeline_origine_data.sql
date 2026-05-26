-- ============================================================================
-- Remap des valeurs origine + auto-sync Pipeline ↔ Origine.
--
-- Mapping ancien → nouveau :
--   '2 - Création par Tiers' → '1 - Création'        (consolidation Création)
--   '3 - Reprise'            → '2 - Reprise'
--   '4 - Reprise sans EC'    → '3 - Reprise sans EC'
--   'Z - Sous-traitance'     → '5 - Sous-traitance'
--   '1 - Création'           → inchangé
--
-- Nouvelles valeurs disponibles : '4 - Interne' (jamais utilisé avant, créé
-- maintenant) + '5 - Sous-traitance' (rebaptisé depuis Z).
--
-- Auto-sync historique : si pipeline_statut = 'Z - Interne' / 'Z - Sous-
-- traitance' et que l'origine est vide ou ancienne, on la cale.
-- ============================================================================

-- 1. Remap des libellés
update public.clients set origine = '1 - Création'       where origine = '2 - Création par Tiers';
update public.clients set origine = '2 - Reprise'         where origine = '3 - Reprise';
update public.clients set origine = '3 - Reprise sans EC' where origine = '4 - Reprise sans EC';
update public.clients set origine = '5 - Sous-traitance'  where origine = 'Z - Sous-traitance';

-- 2. Auto-sync : dossiers internes sans origine → '4 - Interne'
update public.clients
   set origine = '4 - Interne'
 where pipeline_statut = 'Z - Interne'
   and origine is null;

-- 3. Auto-sync : dossiers en Z - Sous-traitance pipeline → '5 - Sous-traitance'
--    (peu probable d'en avoir, mais on couvre le cas)
update public.clients
   set origine = '5 - Sous-traitance'
 where pipeline_statut = 'Z - Sous-traitance'
   and origine is null;
