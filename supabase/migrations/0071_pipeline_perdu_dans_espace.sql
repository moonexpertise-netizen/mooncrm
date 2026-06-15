-- ============================================================================
-- Ajoute une nouvelle valeur au pipeline_statut : "Z - Perdu dans l'espace"
--
-- Categorie metier : proposition commerciale envoyee, jamais repondu, passe
-- un certain temps. Benjamin y "parke" les prospects qui pourraient
-- revenir un jour - distincts des "Z - Prospect perdu" (definitivement
-- abandonnes) et "Z - Resiliee" (anciens clients partis).
-- ============================================================================

alter type pipeline_statut add value if not exists 'Z - Perdu dans l''espace';
