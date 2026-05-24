-- Refonte du pipeline commercial : aligner sur le workflow MOON
--   1. Tally à envoyer
--   2. Tally à compléter
--   3. PC à préparer
--   4. PC envoyée
--   5. PC acceptée
--   6. LDM envoyée
--   7. LDM signée
-- + États terminaux : Z - Prospect perdu, Z - Résiliée, Z - Interne
--
-- Stratégie : on migre les valeurs par UPDATE, on ne touche PAS à l'enum (impossible
-- de drop des valeurs sans recréer le type). Les valeurs anciennes restent dans
-- l'enum mais ne sont plus exposées dans l'UI.

-- Ajoute les nouvelles valeurs (idempotent via IF NOT EXISTS)
alter type pipeline_statut add value if not exists '1 - Tally à envoyer';
alter type pipeline_statut add value if not exists '2 - Tally à compléter';
alter type pipeline_statut add value if not exists '3 - PC à préparer';
alter type pipeline_statut add value if not exists '4 - PC envoyée';
alter type pipeline_statut add value if not exists '5 - PC acceptée';
alter type pipeline_statut add value if not exists '6 - LDM envoyée';
alter type pipeline_statut add value if not exists '7 - LDM signée';
