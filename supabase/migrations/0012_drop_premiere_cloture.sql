-- Retire la colonne premiere_cloture : inutilisée par le moteur d'obligations
-- (seul debut_obligations sert de date de référence pour démarrer la
-- génération d'instances) et plus exposée dans l'UI.
alter table public.clients drop column if exists premiere_cloture;
