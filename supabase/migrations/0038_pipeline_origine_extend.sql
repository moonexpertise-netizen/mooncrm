-- ============================================================================
-- Étend pipeline_statut + origine pour la refonte 0039.
--
-- Postgres impose que ALTER TYPE ADD VALUE soit dans une transaction distincte
-- des UPDATE qui utilisent ces valeurs (cf. migrations 0019/0020 pour le
-- pipeline historique). On sépare donc : extension de l'enum ici, remap des
-- données dans 0039.
--
-- Cibles métier (alignement Pipeline ↔ Origine demandé par Benjamin) :
--
--   PIPELINE :
--     1 - Tally à envoyer / 2 - Tally à compléter / 3 - PC à préparer /
--     4 - PC envoyée / 5 - PC acceptée / 6 - LDM envoyée / 7 - LDM signée /
--     Z - Interne / Z - Sous-traitance / Z - Prospect perdu / Z - Résiliée
--
--   ORIGINE :
--     1 - Création
--     2 - Reprise
--     3 - Reprise sans EC
--     4 - Interne          (synchro auto depuis pipeline Z - Interne)
--     5 - Sous-traitance   (synchro auto depuis pipeline Z - Sous-traitance)
--
-- Les anciennes valeurs (2 - Création par Tiers, 3 - Reprise, 4 - Reprise
-- sans EC, Z - Sous-traitance) restent dans l'enum (impossible de drop
-- proprement en PG) mais ne sont plus exposées dans l'UI après 0039.
-- ============================================================================

-- Pipeline : ajouter Z - Sous-traitance comme état terminal/utilitaire
alter type pipeline_statut add value if not exists 'Z - Sous-traitance';

-- Origine : nouvelles valeurs canoniques
alter type origine add value if not exists '2 - Reprise';
alter type origine add value if not exists '3 - Reprise sans EC';
alter type origine add value if not exists '4 - Interne';
alter type origine add value if not exists '5 - Sous-traitance';
