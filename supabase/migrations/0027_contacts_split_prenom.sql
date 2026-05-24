-- Séparation prénom / nom de famille dans la table contacts.
-- Avant : un seul champ contacts.nom contenant "Prénom NOM" — saisie peu
--         naturelle, split heuristique au moment de la génération LDM.
-- Après : 2 colonnes distinctes contacts.prenom + contacts.nom.
--         contacts.nom contient désormais UNIQUEMENT le nom de famille.

-- 1. Ajout de la nouvelle colonne (nullable, certains contacts historiques
--    n'auront pas de prénom déterminable).
alter table public.contacts
  add column if not exists prenom text;

-- 2. Migration des données existantes : split sur le PREMIER espace.
--    "Benjamin PEREZ" → prenom="Benjamin", nom="PEREZ"
--    "Jean-Paul DE LA TOUR" → prenom="Jean-Paul", nom="DE LA TOUR"
--    "DUPONT" (sans espace) → prenom=null, nom="DUPONT"
--    Seuls les contacts qui ont un espace dans `nom` sont splittés.
update public.contacts
set
  prenom = substring(nom from '^[^ ]+'),
  nom    = trim(substring(nom from ' (.*)$'))
where nom is not null
  and prenom is null
  and position(' ' in nom) > 0;
