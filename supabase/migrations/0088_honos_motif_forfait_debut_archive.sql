-- ============================================================================
-- 1) Archive des forfaits de début : horodatage de clôture (posé au clic sur
--    "Rythme de croisière"). Permet de suivre les remises de démarrage
--    accordées même une fois terminées.
-- 2) Motif des changements d'honoraires : colonne libre sur l'audit log,
--    renseignée via la modale "Ajuster les honoraires".
-- ============================================================================

alter table public.clients
  add column if not exists forfait_debut_termine_at timestamptz;

alter table public.client_audit_log
  add column if not exists motif text;
