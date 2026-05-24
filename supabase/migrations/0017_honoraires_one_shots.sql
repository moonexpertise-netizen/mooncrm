-- Honoraires one-shot pour la LDM (publipostage Excel) :
--   honoraires_reprise   : reprise comptable/fiscale d'un dossier existant
--   honoraires_creation  : création d'une société (statuts + immatriculation)
-- À ne pas confondre avec `exceptionnel` qui reste un poste libre divers.

alter table public.clients
  add column if not exists honoraires_reprise numeric(10,2) NOT NULL DEFAULT 0,
  add column if not exists honoraires_creation numeric(10,2) NOT NULL DEFAULT 0;
