-- Ajoute INFORMATIQUE à l'enum activite (manquait par rapport au Tally).
alter type activite add value if not exists 'INFORMATIQUE';
